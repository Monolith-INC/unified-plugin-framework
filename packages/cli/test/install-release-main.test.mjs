import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { acquireProjectLock, askYesNo, beginRunLog, downloadBytes, main, releaseProjectLock, reportLogPath, setAsideInvalidPlan } from '../../../scripts/install-release.mjs';

const ioFor = (project, overrides = {}) => {
  const stdout = [];
  const stderr = [];
  const fetches = [];
  return {
    cwd: () => project, env: {}, nodeVersion: 'v24.0.0', platform: 'linux', stdinIsTTY: false, stdoutIsTTY: false,
    writeStdout: (text) => stdout.push(text), writeStderr: (text) => stderr.push(text),
    fetch: async () => { fetches.push('fetch'); throw new Error('unexpected fetch'); }, spawnSync: () => ({ status: 1 }),
    ask: async () => 'no', stdout, stderr, fetches, ...overrides,
  };
};

test('installer exposes main(args, io) without running when imported and help is a pure output', async () => {
  const io = ioFor('/unused');
  assert.equal(await main(['--help'], io), 0);
  assert.match(io.stdout.join(''), /Interactive: node install\.mjs/);
  assert.equal(io.fetches.length, 0);
});

test('a UPF source checkout is refused before any question, download or project write', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-source-checkout-'));
  await mkdir(join(project, 'io.github.monolith-inc.upf'), { recursive: true });
  await mkdir(join(project, 'packages', 'cli'), { recursive: true });
  await writeFile(join(project, 'plugin.json'), '{}');
  await writeFile(join(project, 'io.github.monolith-inc.upf', 'onboarded.lock.json'), '{}');
  await writeFile(join(project, 'packages', 'cli', 'package.json'), '{}');
  const io = ioFor(project, { ask: async () => assert.fail('asked a question') });
  assert.equal(await main(['--project', project, '--version', '0.2.2'], io), 1);
  assert.equal(io.fetches.length, 0);
  assert.deepEqual((await readdir(project)).sort(), ['io.github.monolith-inc.upf', 'packages', 'plugin.json']);
  assert.match(io.stderr.join(''), /source checkout[\s\S]*separate test project/);
});

test('explicit plan without private Python consent is refused before downloads or project writes', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-consent-'));
  const input = join(project, 'plan.json');
  await writeFile(input, JSON.stringify({ python: 'python3.12', consent: { privatePython: false } }));
  const io = ioFor(project, { spawnSync: () => ({ status: 1 }) });
  assert.equal(await main(['--input', input, '--project', project, '--version', '0.2.2'], io), 1);
  assert.equal(io.fetches.length, 0);
  assert.deepEqual(await readdir(project), ['plan.json']);
  assert.match(io.stderr.join(''), /consent/i);
});

test('downloads retry only transient network and server responses through the injected delay', async () => {
  const delays = [];
  const responses = [429, 503, 200];
  const io = { ...ioFor('/unused'), fetch: async () => {
    const status = responses.shift();
    return { ok: status === 200, status, arrayBuffer: async () => Buffer.from('ok') };
  }, sleep: async (milliseconds) => delays.push(milliseconds) };
  assert.equal((await downloadBytes('https://example.test/release', 'application/octet-stream', io)).toString(), 'ok');
  assert.deepEqual(delays, [250, 750]);
  const nonRetryable = { ...io, fetch: async () => ({ ok: false, status: 404 }) };
  await assert.rejects(downloadBytes('https://example.test/missing', 'application/octet-stream', nonRetryable), /404/);
});

const deadPid = process.pid + 100_000;
const deadOwner = JSON.stringify({ id: 'stale-run', pid: deadPid, startedAt: '', childPid: null });
const age = (path) => { const old = new Date(Date.now() - 60_000); return utimes(path, old, old); };
const lockIn = async (prefix) => {
  const project = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(project, '.upf-tools'));
  return { project, directory: join(project, '.upf-tools'), path: join(project, '.upf-tools', 'installer.lock') };
};
const claimPathOf = async (path) => { const info = await stat(path); return `${path}.reclaim-${info.dev}-${info.ino}`; };
const waitingIo = { now: () => Date.now(), processAlive: (pid) => pid === process.pid, sleep: () => Promise.reject(new Error('waited')) };

test('an abandoned installer lock is reclaimed once and waiters reacquire after release', async () => {
  const { project, directory, path } = await lockIn('upf-launcher-lock-');
  await writeFile(path, deadOwner);
  await age(path);
  let releaseWait;
  let markWaiting;
  const waiting = new Promise((resolve) => { markWaiting = resolve; });
  const io = { ...waitingIo, sleep: () => { markWaiting(); return new Promise((resolve) => { releaseWait = resolve; }); } };
  const firstPending = acquireProjectLock(project, io);
  const secondPending = acquireProjectLock(project, io);
  const { source, lock: winner } = await Promise.race([
    firstPending.then((lock) => ({ source: 'first', lock })),
    secondPending.then((lock) => ({ source: 'second', lock })),
  ]);
  const waiter = source === 'first' ? secondPending : firstPending;
  await waiting;
  let settled = false;
  waiter.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  await releaseProjectLock(winner);
  releaseWait();
  const next = await waiter;
  assert.notEqual(next.id, winner.id);
  await releaseProjectLock(next);
  assert.deepEqual(await readdir(directory), []);
});

test('a claim left by a killed recovery is succeeded and the whole chain removed after reclaim', async () => {
  const { project, directory, path } = await lockIn('upf-launcher-dead-claim-');
  await writeFile(path, deadOwner);
  await writeFile(await claimPathOf(path), JSON.stringify({ pid: deadPid, token: 'abandoned-claim' }));
  const lock = await acquireProjectLock(project, waitingIo);
  await releaseProjectLock(lock);
  assert.deepEqual(await readdir(directory), []);
});

test('a dead lock claimed by a live recovery is waited on and left alone', async () => {
  const { project, path } = await lockIn('upf-launcher-live-claim-');
  await writeFile(path, deadOwner);
  const claimPath = await claimPathOf(path);
  await writeFile(claimPath, JSON.stringify({ pid: process.pid, token: 'live-claim' }));
  await assert.rejects(acquireProjectLock(project, waitingIo), /waited/);
  assert.equal((await stat(path)).isFile(), true);
  assert.equal((await stat(claimPath)).isFile(), true);
});

test('a live successor of a dead claim holds the chain, so the dead lock is waited on', async () => {
  const { project, directory, path } = await lockIn('upf-launcher-claim-chain-');
  await writeFile(path, deadOwner);
  const claimPath = await claimPathOf(path);
  await writeFile(claimPath, JSON.stringify({ pid: deadPid, token: 'dead-claim' }));
  await writeFile(`${claimPath}.after-dead-claim`, JSON.stringify({ pid: process.pid, token: 'live-claim' }));
  await assert.rejects(acquireProjectLock(project, waitingIo), /waited/);
  const claimName = basename(claimPath);
  assert.deepEqual((await readdir(directory)).sort(), ['installer.lock', claimName, `${claimName}.after-dead-claim`]);
});

test('a lock whose owner record is not an owner is waited on rather than crashing', async () => {
  const { project, path } = await lockIn('upf-launcher-null-owner-');
  await writeFile(path, 'null');
  await assert.rejects(acquireProjectLock(project, waitingIo), /waited/);
  assert.equal(await readFile(path, 'utf8'), 'null');
});

test('an old legacy lock whose owner record is still being written is kept and waited on', async () => {
  const { project, directory, path } = await lockIn('upf-launcher-legacy-lock-');
  await mkdir(path);
  await writeFile(join(path, 'owner.json'), '{"id":"legacy-run","pid":');
  await age(path);
  await assert.rejects(acquireProjectLock(project, waitingIo), /waited/);
  assert.deepEqual(await readdir(path), ['owner.json']);
  assert.deepEqual(await readdir(directory), ['installer.lock']);
});

test('a legacy lock left with a truncated owner record past the grace period is reclaimed', async () => {
  const { project, directory, path } = await lockIn('upf-launcher-truncated-lock-');
  await mkdir(path);
  await writeFile(join(path, 'owner.json'), '{"id":"legacy-run","pid":');
  await age(join(path, 'owner.json'));
  await age(path);
  const lock = await acquireProjectLock(project, waitingIo);
  assert.equal((await stat(path)).isFile(), true);
  await releaseProjectLock(lock);
  assert.deepEqual(await readdir(directory), []);
});

test('the launcher yes or no accepts short answers and asks again with an example', async () => {
  const replies = (answers) => { const prompts = []; return { prompts, io: { ask: async (prompt) => { prompts.push(prompt); return answers.shift(); } } }; };
  const cases = [[['y'], true], [[' YES '], true], [['n'], false], [['No'], false], [['yes please', 'y'], true], [['', 'maybe', 'sure'], false]];
  const results = await Promise.all(cases.map(([answers]) => askYesNo(replies([...answers]).io, 'Allow? yes/no: ')));
  assert.deepEqual(results, cases.map(([, expected]) => expected));
  const asked = replies(['ok', 'n']);
  assert.equal(await askYesNo(asked.io, 'Allow? yes/no: '), false);
  assert.deepEqual(asked.prompts, ['Allow? yes/no: ', 'Please answer yes or no, for example: yes. Allow? yes/no: ']);
});

test('launcher log failure is optional and the CLI-reported log path takes precedence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'upf-launcher-log-module-'));
  const modulePath = join(root, 'packages', 'cli', 'dist');
  await mkdir(modulePath, { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(modulePath, 'install-log.js'), 'export const writeInstallLog = async () => null;');
  assert.equal(await beginRunLog(root, root, 'v0.2.2', { now: () => 0 }), null);
  assert.equal(reportLogPath({ ok: true, value: { log: '/tmp/cli.jsonl' } }, '/tmp/launcher.jsonl'), '/tmp/cli.jsonl');
  assert.equal(reportLogPath({ ok: false, log: '/tmp/fallback.jsonl' }, null), '/tmp/fallback.jsonl');
  assert.equal(reportLogPath({ ok: false }, null), null);
});

const noLog = /No log was written because the installer stopped before changing the project\./;
const pythonOnly = (accepted, calls = []) => (program) => { calls.push(program); return { status: accepted.includes(program) ? 0 : 1 }; };

test('a rerun reuses the project private Python without asking consent or downloading it again', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-reuse-'));
  const interpreter = join(project, '.upf-tools', 'python', 'cpython-3.12.16-linux-x86_64-gnu', 'bin', 'python3.12');
  await mkdir(join(interpreter, '..'), { recursive: true });
  await writeFile(interpreter, '');
  const asked = [];
  const io = ioFor(project, { stdinIsTTY: true, stdoutIsTTY: true, spawnSync: pythonOnly([interpreter]), ask: async (prompt) => { asked.push(prompt); return 'no'; } });
  assert.equal(await main(['--project', project, '--version', '0.2.2'], io), 1);
  assert.deepEqual(asked, []);
  assert.match(io.stderr.join(''), /unified-plugin-framework-0\.2\.2\.tar\.gz/);
  assert.doesNotMatch(io.stderr.join(''), /consent|uv/);
});

test('a rerun reuses the saved plan Python before offering a private installation', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-saved-'));
  await mkdir(join(project, '.upf-tools'));
  await writeFile(join(project, '.upf-tools', 'setup-plan.json'), JSON.stringify({ python: '/saved/python3.12' }));
  const calls = [];
  const io = ioFor(project, { stdinIsTTY: true, stdoutIsTTY: true, spawnSync: pythonOnly(['/saved/python3.12'], calls), ask: async () => assert.fail('asked consent') });
  assert.equal(await main(['--project', project, '--version', '0.2.2'], io), 1);
  assert.ok(calls.includes('/saved/python3.12'));
});

test('a pinned uv checksum mismatch is downloaded once more, then stops with an instruction and no log', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-uv-'));
  const input = join(project, 'plan.json');
  await writeFile(input, JSON.stringify({ consent: { privatePython: true } }));
  const fetches = [];
  const io = ioFor(project, { arch: 'x64', libc: 'gnu', fetch: async (url) => { fetches.push(url); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('corrupt') }; } });
  assert.equal(await main(['--input', input, '--project', project, '--version', '0.2.2'], io), 1);
  assert.equal(fetches.length, 2);
  assert.match(io.stderr.join(''), /uv checksum mismatch; private Python was not installed\. Try again later or from another network\./);
  assert.match(io.stderr.join(''), noLog);
  assert.deepEqual(await readdir(project), ['plan.json']);
});

test('a release archive checksum mismatch is downloaded once more, then stops with an instruction and no log', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-archive-'));
  const fetches = [];
  const io = ioFor(project, { spawnSync: pythonOnly(['python3.12']), fetch: async (url) => { fetches.push(basename(url)); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('corrupt') }; } });
  assert.equal(await main(['--input', join(project, 'absent.json'), '--project', project, '--version', '0.2.2'], io), 1);
  assert.deepEqual(fetches.toSorted(), ['SHA256SUMS', 'SHA256SUMS', 'unified-plugin-framework-0.2.2.tar.gz', 'unified-plugin-framework-0.2.2.tar.gz']);
  assert.match(io.stderr.join(''), /Archive checksum mismatch.*Try again later or from another network\./);
  assert.match(io.stderr.join(''), noLog);
  assert.deepEqual(await readdir(project), []);
});

test('launcher stops before confirmation name the instruction and why no log exists', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-early-'));
  const io = ioFor(project, { nodeVersion: '20.0.0' });
  assert.equal(await main([], io), 1);
  assert.match(io.stderr.join(''), /Install Node\.js 22 or newer, then run the installer again\./);
  assert.match(io.stderr.join(''), noLog);
  const refused = ioFor(project, { stdinIsTTY: true, stdoutIsTTY: true });
  assert.equal(await main(['--project', project, '--version', '0.2.2'], refused), 1);
  assert.match(refused.stderr.join(''), /pass --python <executable>, then run the installer again\./);
  assert.match(refused.stderr.join(''), noLog);
});

test('after confirmation an invalid saved plan is set aside as .broken-<time> and a valid one is kept in place', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-broken-'));
  const input = join(project, 'setup-plan.json');
  const log = join(project, 'run.log');
  const parse = (value) => ({ ok: value?.hosts !== undefined });
  const io = { now: () => Date.UTC(2026, 10, 19, 9, 30) };
  await writeFile(input, '{not json');
  assert.equal(await setAsideInvalidPlan(input, '{not json', parse, io, log), null);
  assert.deepEqual((await readdir(project)).sort(), ['run.log', 'setup-plan.json.broken-2026-11-19T09-30-00-000Z']);
  assert.match(await readFile(log, 'utf8'), /"event":"set-aside","code":"invalid-saved-plan"/);
  await writeFile(input, '{"hosts":["codex"]}');
  assert.equal(await setAsideInvalidPlan(input, '{"hosts":["codex"]}', parse, io, log), '{"hosts":["codex"]}');
  assert.equal(await setAsideInvalidPlan(join(project, 'absent.json'), null, parse, io, log), null);
});

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireProjectLock, beginRunLog, downloadBytes, main, releaseProjectLock, reportLogPath } from '../../../scripts/install-release.mjs';

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

test('an abandoned installer lock is reclaimed once and waiters reacquire after release', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-lock-'));
  const directory = join(project, '.upf-tools');
  const path = join(directory, 'installer.lock');
  await mkdir(directory);
  await writeFile(path, JSON.stringify({ id: 'stale-run', pid: process.pid + 100_000, startedAt: '', childPid: null }));
  await writeFile(`${path}.reclaim-stale-run`, JSON.stringify({ id: 'stale-run', pid: process.pid + 100_000, token: 'abandoned-claim' }));
  const old = new Date(Date.now() - 60_000);
  await utimes(path, old, old);
  let releaseWait;
  let markWaiting;
  const waiting = new Promise((resolve) => { markWaiting = resolve; });
  const io = { now: () => Date.now(), processAlive: (pid) => pid === process.pid,
    sleep: () => { markWaiting(); return new Promise((resolve) => { releaseWait = resolve; }); } };
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

test('an old legacy lock whose owner record is still being written is kept and waited on', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-launcher-legacy-lock-'));
  const path = join(project, '.upf-tools', 'installer.lock');
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'owner.json'), '{"id":"legacy-run","pid":');
  const old = new Date(Date.now() - 60_000);
  await utimes(path, old, old);
  const io = { now: () => Date.now(), processAlive: () => false, sleep: () => Promise.reject(new Error('waited')) };
  await assert.rejects(acquireProjectLock(project, io), /waited/);
  assert.deepEqual(await readdir(path), ['owner.json']);
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

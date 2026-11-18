import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { downloadBytes, main } from '../../../scripts/install-release.mjs';

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

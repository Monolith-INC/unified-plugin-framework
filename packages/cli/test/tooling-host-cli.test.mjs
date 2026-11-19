import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareHostCli } from '../dist/tooling-host-cli.js';

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'upf-host-cli-'));
  const project = join(root, 'project');
  const home = join(root, 'home');
  const bin = join(root, 'bin');
  await Promise.all([project, home, bin].map(path => mkdir(path)));
  return { project, home, bin, env: { HOME: home, PATH: bin } };
};

test('host setup reuses an existing executable without downloading or changing PATH', {skip: process.platform === 'win32'}, async () => {
  const { project, home, bin, env } = await fixture();
  const executable = join(bin, 'claude');
  await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = await prepareHostCli(project, 'claude', 'python3.12', true, { environment: env, sleep: async () => undefined, fetcher: () => assert.fail('already installed') });
  assert.deepEqual(result, { kind: 'available', program: executable, source: 'path', installed: false });
  assert.deepEqual(await readdir(home), []);
  assert.deepEqual(env, { HOME: home, PATH: bin });
});

test('a missing host CLI with no consent causes no download or write', async () => {
  const { project, home, env } = await fixture();
  const result = await prepareHostCli(project, 'claude', 'python3.12', false, { environment: env, sleep: async () => undefined, fetcher: () => assert.fail('no consent') });
  assert.deepEqual(result, { kind: 'missing', attempted: false });
  assert.deepEqual(await readdir(home), []);
});

test('a tampered native package is never published or interpreted', {skip: process.platform !== 'linux' || !['x64','arm64'].includes(process.arch)}, async () => {
  const { project, home, env } = await fixture();
  const requested = [];
  const wrongPackage = 'fake archive';
  const result = await prepareHostCli(project, 'claude', 'python-must-not-run', true, { environment: env, sleep: async () => undefined, fetcher: async (url, options) => {
    requested.push(url);
    assert.equal(options.redirect, 'error');
    return new Response(wrongPackage, {headers:{'content-length':String(wrongPackage.length)}});
  } });
  assert.deepEqual(result, { kind: 'missing', attempted: true });
  assert.equal(requested.length, 2, 'a checksum mismatch is downloaded once more, then refused');
  assert.match(requested[0], /^https:\/\/registry\.npmjs\.org\/@anthropic-ai\/claude-code-linux-/);
  assert.deepEqual(await readdir(join(home,'.local/share/unified-plugin-framework/host-clis')), []);
});

test('an unreachable native package is tried three times with backoff, then reported as not installed', {skip: process.platform !== 'linux' || !['x64','arm64'].includes(process.arch)}, async () => {
  const { project, home, env } = await fixture();
  const delays = [];
  const requested = [];
  const result = await prepareHostCli(project, 'claude', 'python-must-not-run', true, { environment: env, sleep: async (milliseconds) => { delays.push(milliseconds); }, fetcher: async (url) => {
    requested.push(url);
    throw new TypeError('network down');
  } });
  assert.deepEqual(result, { kind: 'missing', attempted: true });
  assert.equal(requested.length, 3);
  assert.deepEqual(delays, [250, 750]);
  assert.deepEqual(await readdir(join(home,'.local/share/unified-plugin-framework/host-clis')), []);
});

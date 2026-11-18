import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readLastInstallLog, writeInstallLog } from '../dist/install-log.js';
import { run } from '../dist/index.js';

test('install log redacts named secrets and URL credentials and uses private permissions', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-install-log-'));
  const path = await writeInstallLog(project, [{ type: 'failure', token: 'fake-secret-value', message: 'https://user:password@example.test/setup' }]);
  assert.ok(path);
  const text = await readFile(path, 'utf8');
  assert.doesNotMatch(text, /fake-secret-value|user:password/);
  assert.match(text, /\[REDACTED\]/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(project, '.upf-tools', 'logs'))).mode & 0o777, 0o700);
  assert.equal((await readLastInstallLog(project)).entries.length, 1);
});

test('install log keeps the latest ten runs', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-install-retention-'));
  await Array.from({ length: 11 }, (_, index) => index).reduce((pending, index) =>
    pending.then(() => writeInstallLog(project, [{ run: index }])), Promise.resolve());
  assert.equal((await readdir(join(project, '.upf-tools', 'logs'))).length, 10);
});

test('install log falls back to a private temporary directory when its requested folder is unwritable', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-install-fallback-'));
  const blocker = join(project, 'not-a-directory');
  await writeFile(blocker, 'preserve');
  const path = await writeInstallLog(project, [{ type: 'bootstrap' }], join(blocker, 'run.jsonl'));
  assert.ok(path);
  assert.notEqual(path, join(blocker, 'run.jsonl'));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await readLastInstallLog(project)).path, path);
  assert.equal(await readFile(blocker, 'utf8'), 'preserve');
});

test('project status displays the last recorded bootstrap run', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-project-status-'));
  const path = await writeInstallLog(project, [{ type: 'bootstrap', status: 'ready' }]);
  const output = [];
  const result = await run(['project', 'status', '--project', project], {
    out: (line) => output.push(line), err: () => undefined, cwd: () => project, claudeState: () => join(project, '.claude.json'),
  });
  assert.equal(result, 0);
  assert.equal(JSON.parse(output[0]).value.log.path, path);
  assert.equal(JSON.parse(output[0]).value.log.entries[0].status, 'ready');
});

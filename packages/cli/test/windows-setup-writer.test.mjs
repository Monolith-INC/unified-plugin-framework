import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ok } from '@agent-plugins/project';
import { readConfinedText, withSetupStage, writeText } from '../dist/tooling-files.js';

const windows = { skip: process.platform !== 'win32' };
const project = () => mkdtemp(join(tmpdir(), 'upf-win-writer-'));
const writer = fileURLToPath(new URL('../scripts/setup-write.py', import.meta.url));
const windowsWriter = fileURLToPath(new URL('../scripts/setup-write-windows.py', import.meta.url));

test('Windows writer preserves the reviewed snapshot and rejects a stale update', windows, async () => {
  const root = await project();
  const path = join(root, '.codex', 'config.toml');
  await mkdir(join(root, '.codex'));
  await writeFile(path, 'model = "first"\n');
  const permissions = spawnSync('icacls', [path], { encoding: 'utf8' });
  assert.equal(permissions.status, 0);
  assert.equal((await readConfinedText(root, path, 'python')).value, 'model = "first"\n');
  const diagnostic = spawnSync('python', ['-I', '-c',
    'import runpy,sys; from pathlib import Path; m=runpy.run_path(sys.argv[1]); print(m["update"](Path(sys.argv[2]),Path(sys.argv[3]),sys.argv[4],sys.argv[5],True))',
    windowsWriter, root, path, 'model = "second"\n', 'model = "first"\n'], { encoding: 'utf8' });
  assert.equal(diagnostic.stdout.trim(), 'written', diagnostic.stderr);
  assert.equal((await writeText(root, path, 'model = "stale"\n', 'model = "first"\n', 'python', true)).error.code, 'modified-file');
  assert.equal(await readFile(path, 'utf8'), 'model = "second"\n');
  assert.equal(spawnSync('icacls', [path], { encoding: 'utf8' }).stdout, permissions.stdout);
});

test('Windows writer rejects a junction without changing its target', windows, async () => {
  const root = await project();
  const outside = await project();
  const external = join(outside, 'config.toml');
  await writeFile(external, 'preserve');
  await symlink(outside, join(root, '.codex'), 'junction');
  const result = await writeText(root, join(root, '.codex', 'config.toml'), 'changed', 'preserve', 'python', true);
  assert.equal(result.ok, false);
  const direct = spawnSync('python', ['-I', writer, root, join(root, '.codex', 'config.toml')], {
    encoding: 'utf8', input: JSON.stringify({ content: 'changed', previous: 'preserve' }),
  });
  assert.equal(direct.stdout.trim(), 'symlink-escape');
  assert.equal(await readFile(external, 'utf8'), 'preserve');
});

test('Windows writer rejects a junction above the supplied root', windows, async () => {
  const container = await project();
  const outside = await project();
  await mkdir(join(outside, 'project'));
  const alias = join(container, 'linked');
  await symlink(outside, alias, 'junction');
  const root = join(alias, 'project');
  const direct = spawnSync('python', ['-I', writer, root, join(root, 'settings.json')], {
    encoding: 'utf8', input: JSON.stringify({ content: 'changed', previous: null }),
  });
  assert.equal(direct.stdout.trim(), 'symlink-escape');
});

test('Windows writer serializes competing updates', windows, async () => {
  const root = await project();
  const path = join(root, 'settings.json');
  await writeFile(path, 'before');
  const results = await Promise.all(['first', 'second'].map((value) => writeText(root, path, value, 'before', 'python')));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.ok(['first', 'second'].includes(await readFile(path, 'utf8')));
});

test('Windows writer uses the same lease for case aliases', windows, async () => {
  const root = await project();
  const path = join(root, 'settings.json');
  await writeFile(path, 'before');
  const results = await Promise.all([
    writeText(root, path, 'first', 'before', 'python'),
    writeText(root, join(root, 'SETTINGS.JSON'), 'second', 'before', 'python'),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.ok(['first', 'second'].includes(await readFile(path, 'utf8')));
});

test('Windows staging keeps a published directory in place', windows, async () => {
  const root = await project();
  const destination = join(root, 'published');
  const result = await withSetupStage(root, 'python', async (path) => {
    await writeFile(join(path, 'content'), 'ready');
    await rename(path, destination);
    return ok(destination);
  });
  assert.equal(result.ok, true);
  assert.equal(await readFile(join(destination, 'content'), 'utf8'), 'ready');
});

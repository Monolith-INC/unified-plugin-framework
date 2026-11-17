import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const run = (root, args) => JSON.parse(execFileSync(process.execPath, [cli, 'project', ...args, '--project', root], {encoding: 'utf8'}));

test('actual CLI bootstraps a new project, resumes once, and reuses its adapter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'upf-project-host-'));
  const request = {operation: 'create_work_item', kind: 'user_story', title: 'Configure shared project', description: 'Resume the original request.'};
  await writeFile(join(root, 'request.json'), JSON.stringify(request));
  const first = run(root, ['request', '--input', 'request.json']);
  assert.equal(first.value.status, 'setup-needed');
  assert.deepEqual(first.value.request, request);
  await writeFile(join(root, 'answers.json'), JSON.stringify({language: 'pt-BR', artifactsPath: 'docs/work-items', tracker: {adapter: 'local', values: {}}}));
  const configured = run(root, ['setup', '--input', 'answers.json', '--resume', 'request.json']);
  assert.equal(configured.value.status, 'completed');
  assert.equal(configured.value.language, 'pt-BR');
  const id = configured.value.value.id;
  await writeFile(join(root, 'get.json'), JSON.stringify({operation: 'get_work_item', ref: id}));
  assert.equal(run(root, ['request', '--input', 'get.json']).value.value.title, request.title);
  assert.equal(JSON.parse(await readFile(join(root, '.unified-plugin-framework', 'items.json'), 'utf8')).length, 1);
  assert.equal(run(root, ['describe']).value.value.tracker.adapter, 'local');
});

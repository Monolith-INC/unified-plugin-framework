import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseBootstrap } from '../dist/tooling-input.js';
import { recordHandoffs, manageHandoffs } from '../dist/tooling-handoffs.js';

const fixture = async () => {
  const temp = await mkdtemp(join(tmpdir(), 'upf-handoffs-'));
  const project = join(temp, 'project');
  const state = join(temp, 'state');
  await mkdir(project);
  const plan = parseBootstrap({ host: 'codex', python: 'python3', workflows: ['discovery'],
    pluginRoots: [], knowledge: { knowledgeRoot: 'knowledge', documentMode: 'shared', docsRoot: 'docs', vaultRoot: 'docs' } }).value;
  return { project, state, plan, pending: join(project, '.upf-tools/pending-tasks.json') };
};
const list = { kind: 'list' };
const task = 'knowledge-discovery';
const claim = { kind: 'claim', task };
const ready = async () => true;
const missing = async () => false;

test('a planted task list is ignored even if it contains a known task', async () => {
  const { project, state, pending, plan } = await fixture();
  await mkdir(join(project, '.upf-tools'));
  await writeFile(pending, JSON.stringify({ version: 1, tasks: [task], plan }));
  const check = await manageHandoffs(project, state, claim, () => assert.fail('must not inspect an unverified plan'));
  assert.equal(check.value.status, 'ignored');
  assert.match(check.value.message, /receipt/i);
});

test('a verified task is claimed once, completed only when ready, and then skipped', { skip: process.platform === 'win32' }, async () => {
  const { project, state, plan } = await fixture();
  const issued = await recordHandoffs(project, state, plan, [task]);
  assert.equal(issued.ok, true, JSON.stringify(issued));
  assert.deepEqual((await manageHandoffs(project, state, list, missing)).value.tasks, [task]);
  const [left, right] = await Promise.all([
    manageHandoffs(project, state, claim, missing),
    manageHandoffs(project, state, claim, missing),
  ]);
  const claimed = [left, right].filter(reply => reply.value?.status === 'claimed');
  assert.equal(claimed.length, 1);
  const finish = { kind: 'finish', task, token: claimed[0].value.token };
  assert.equal((await manageHandoffs(project, state, finish, missing)).value.status, 'not-ready');
  assert.equal((await manageHandoffs(project, state, { ...finish, token: 'other' }, ready)).value.status, 'not-claimed');
  assert.equal((await manageHandoffs(project, state, finish, ready)).value.status, 'done');
  assert.deepEqual((await manageHandoffs(project, state, list, missing)).value.tasks, []);
  assert.equal((await manageHandoffs(project, state, claim, () => assert.fail('a finished task must not run again'))).value.status, 'ready');
});

test('content changes or a receipt copied to another project cannot activate tasks', { skip: process.platform === 'win32' }, async () => {
  const { project, state, plan, pending } = await fixture();
  assert.equal((await recordHandoffs(project, state, plan, [task])).ok, true);
  const bytes = await readFile(pending, 'utf8');
  await writeFile(pending, bytes + '\n');
  assert.equal((await manageHandoffs(project, state, list, missing)).value.status, 'ignored');
  const other = await fixture();
  await mkdir(join(other.project, '.upf-tools'));
  await writeFile(other.pending, bytes);
  assert.equal((await manageHandoffs(other.project, state, claim, missing)).value.status, 'ignored');
});

test('an expired claim can be replaced; already ready work needs no claim', { skip: process.platform === 'win32' }, async () => {
  const { project, state, plan } = await fixture();
  assert.equal((await recordHandoffs(project, state, plan, [task])).ok, true);
  assert.equal((await manageHandoffs(project, state, claim, ready)).value.status, 'ready');
  const first = await manageHandoffs(project, state, claim, missing, 0);
  const second = await manageHandoffs(project, state, claim, missing, 24 * 60 * 60 * 1000);
  assert.equal(second.value.status, 'claimed');
  assert.notEqual(second.value.token, first.value.token);
});

test('linked and oversized task files are ignored', { skip: process.platform === 'win32' }, async () => {
  const { project, state, pending } = await fixture();
  const target = join(project, 'outside.json');
  await mkdir(join(project, '.upf-tools'));
  await writeFile(target, '{}');
  await symlink(target, pending);
  assert.equal((await manageHandoffs(project, state, list, missing)).value.status, 'ignored');
  const other = await fixture();
  await mkdir(join(other.project, '.upf-tools'));
  await writeFile(other.pending, Buffer.alloc(300 * 1024));
  assert.equal((await manageHandoffs(other.project, other.state, list, missing)).value.status, 'ignored');
});

test('continuity-setup is a valid handoff task kind that can be recorded and completed', { skip: process.platform === 'win32' }, async () => {
  const { project, state, plan } = await fixture();
  const issued = await recordHandoffs(project, state, plan, ['continuity-setup']);
  assert.equal(issued.ok, true, JSON.stringify(issued));
  assert.deepEqual((await manageHandoffs(project, state, list, missing)).value.tasks, ['continuity-setup']);
  const claimed = await manageHandoffs(project, state, { kind: 'claim', task: 'continuity-setup' }, missing);
  assert.equal(claimed.value.status, 'claimed');
  const finished = await manageHandoffs(project, state, { kind: 'finish', task: 'continuity-setup', token: claimed.value.token }, ready);
  assert.equal(finished.value.status, 'done');
});

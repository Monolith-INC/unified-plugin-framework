import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLocal, configure, fail, linearCall, linearReply, ok, operate, parseRequest, parseSettings, setup } from '../dist/index.js';

const settings = {schemaVersion: 1, language: 'pt-BR', artifactsPath: 'docs/work-items', tracker: {adapter: 'local', values: {}}};
const create = {operation: 'create_work_item', kind: 'user_story', title: 'Shared project setup', description: 'Resume the request.'};
const io = (raw, changes = {}) => ({
  readSettings: () => Promise.resolve(ok(raw)),
  saveSettings: () => () => Promise.resolve(ok(null)),
  local: () => () => Promise.resolve(ok({id: 'one'})),
  remote: () => () => Promise.resolve(fail('unexpected', 'Remote should not run.', 'Fix routing.')),
  ...changes,
});

test('missing settings hand the same request to bootstrap without invoking a tracker', async () => {
  const result = await operate(io(null, {local: () => () => assert.fail('setup must happen first')}), create)();
  assert.equal(result.value.status, 'setup-needed');
  assert.equal(result.value.request, create);
  assert.equal(result.value.setup.skill, 'project-bootstrap');
});

test('accepted setup preserves other project choices and resumes through the same operation path', async () => {
  const expected = {...settings, houseRules: ['one source']};
  const result = await setup(io({houseRules: ['one source']}, {
    saveSettings: (saved) => () => {assert.deepEqual(saved, expected); return Promise.resolve(ok(null));},
    local: (request) => () => {assert.equal(request, create); return Promise.resolve(ok({id: 'resumed'}));},
  }), settings, create)();
  assert.deepEqual(result, ok({status: 'completed', language: 'pt-BR', artifactsPath: 'docs/work-items', value: {id: 'resumed'}}));
});

test('existing settings route directly, and missing credentials do not restart bootstrap', async () => {
  const ready = await operate(io(settings), create)();
  assert.equal(ready.value.status, 'completed');
  const remote = {...settings, tracker: {adapter: 'linear', values: {team: '11111111-1111-1111-1111-111111111111', project: '22222222-2222-2222-2222-222222222222'}}};
  const failed = await operate(io(remote, {remote: () => () => Promise.resolve(fail('authentication-needed', 'Sign in.', 'Restore the credential.'))}), create)();
  assert.equal(failed.error.code, 'authentication-needed');
});

test('bootstrap patches preserve nested tracker values and reject unknown versions', () => {
  const initial = {...settings, tracker: {adapter: 'linear', values: {team: '11111111-1111-1111-1111-111111111111', project: '22222222-2222-2222-2222-222222222222', 'state.ready': 'Ready'}}};
  const patched = configure(initial, {language: 'en', tracker: {values: {project: '33333333-3333-3333-3333-333333333333'}}});
  assert.equal(patched.value.tracker.values.team, '11111111-1111-1111-1111-111111111111');
  assert.equal(patched.value.tracker.values['state.ready'], 'Ready');
  assert.equal(patched.value.tracker.values.project, '33333333-3333-3333-3333-333333333333');
  assert.equal(parseSettings({...settings, schemaVersion: 2}).error.code, 'unsupported-settings');
  assert.equal(parseRequest({operation: 'update_work_item', ref: 'one', changes: {state: 'done'}}).ok, false);
});

test('local work items support parented updates, transition, search and idempotent artifact revisions', () => {
  const parent = applyLocal([], {...create, kind: 'feature'}, 'parent').value;
  const child = applyLocal(parent.items, {...create, parent: 'parent'}, 'child').value;
  const updated = applyLocal(child.items, {operation: 'update_work_item', ref: 'child', changes: {title: 'Updated'}}, '').value;
  const done = applyLocal(updated.items, {operation: 'transition_work_item', ref: 'child', state: 'done'}, '').value;
  assert.equal(done.reply.state, 'done');
  assert.equal(applyLocal(done.items, {operation: 'list_children', ref: 'parent'}, '').value.reply.items[0].title, 'Updated');
  assert.equal(applyLocal(done.items, {operation: 'search_work_items', query: 'updated'}, '').value.reply.items.length, 1);
  assert.equal(applyLocal(done.items, {operation: 'update_work_item', ref: 'parent', changes: {parent: 'child'}}, '').error.code, 'invalid-parent');
  const artifact = {kind: 'plan', title: 'Plan', revision: 'r1', content: 'Approved scope'};
  const published = applyLocal(done.items, {operation: 'publish_artifact', ref: 'child', artifact}, '').value;
  assert.equal(applyLocal(published.items, {operation: 'publish_artifact', ref: 'child', artifact}, '').value.changed, false);
  assert.equal(applyLocal(published.items, {operation: 'publish_artifact', ref: 'child', artifact: {...artifact, content: 'Different'}}, '').error.code, 'artifact-conflict');
});

test('provider translation isolates connector arguments and normalizes replies', () => {
  const tracker = {adapter: 'linear', values: {team: 'AGE', project: 'project', 'kind.user_story': 'User Story'}};
  assert.deepEqual(linearCall(tracker, create).value, {name: 'save_issue', arguments: {team: 'AGE', project: 'project', title: create.title, description: create.description, labels: ['User Story']}});
  assert.deepEqual(linearCall(tracker, {operation: 'transition_work_item', ref: 'AGE-100', state: 'done'}).value, {name: 'save_issue', arguments: {id: 'AGE-100', state: 'Done'}});
  const decoded = linearReply(tracker, {operation: 'get_work_item', ref: 'AGE-100'}, {id: 'uuid', identifier: 'AGE-100', title: 'Setup', description: 'Body', labels: ['User Story'], status: 'Done'});
  assert.equal(decoded.value.kind, 'user_story');
  assert.equal(decoded.value.state, 'done');
  assert.equal(linearReply(tracker, {operation: 'get_work_item', ref: 'AGE-100'}, {id: 'uuid', title: 'Setup', labels: [], status: 'Done'}).error.code, 'unmapped-kind');
});

test('project patch aggregation obeys associativity and both identity laws', async () => {
  const {objectPatches: M} = await import('../dist/index.js');
  const samples = [{}, {language: 'en'}, {language: 'pt-BR', custom: {one: true}}];
  samples.map((a) => {
    assert.deepEqual(M.concat(M.empty, a), a);
    assert.deepEqual(M.concat(a, M.empty), a);
    return samples.map((b) => samples.map((c) => assert.deepEqual(M.concat(M.concat(a,b),c), M.concat(a,M.concat(b,c)))));
  });
});

test('partial connection answers preserve existing choices and malformed URLs are rejected', () => {
  const initial = {...settings, tracker: {adapter: 'linear', values: {team: '11111111-1111-1111-1111-111111111111', project: '22222222-2222-2222-2222-222222222222'}, connection: {url: 'https://mcp.linear.app/mcp', tokenEnv: 'LINEAR_API_KEY'}}};
  const patched = configure(initial, {tracker: {connection: {tokenEnv: 'PROJECT_TOKEN'}}});
  assert.deepEqual(patched.value.tracker.connection, {url: 'https://mcp.linear.app/mcp', tokenEnv: 'PROJECT_TOKEN'});
  assert.equal(configure(initial, {tracker: {connection: {url: 'https://'}}}).error.code, 'setup-needed');
  assert.equal(configure(initial, {tracker: {values: {team: 'AGE'}}}).error.code, 'setup-needed');
});

test('both adapters expose the same listing and publication contract', () => {
  const tracker = {adapter: 'linear', values: {team: 'team-id', project: 'project-id'}};
  const stored = applyLocal([], create, 'AGE-100').value;
  const request = {operation: 'search_work_items', query: ''};
  const local = applyLocal(stored.items, request, '').value.reply;
  const remote = linearReply(tracker, request, {issues: [{id: 'uuid', identifier: 'AGE-100', title: create.title, description: create.description, labels: ['Story'], status: 'Backlog'}], hasNextPage: false});
  assert.deepEqual(local, remote.value);
  const artifact = {kind: 'plan', title: 'Plan', content: 'Scope', revision: 'r1'};
  const publish = {operation: 'publish_artifact', ref: 'AGE-100', artifact};
  assert.deepEqual(applyLocal(stored.items, publish, '').value.reply, linearReply(tracker, publish, {}).value);
});

test('an unavailable local storage directory returns a recovery without throwing or overwriting it', async () => {
  const {mkdtemp, writeFile, readFile} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {nodeProjectIO} = await import('../dist/index.js');
  const root = await mkdtemp(join(tmpdir(), 'upf-storage-conflict-'));
  const path = join(root, '.unified-plugin-framework');
  await writeFile(path, 'preserve this existing file');
  const result = await nodeProjectIO(root).local(create)();
  assert.equal(result.error.code, 'storage-error');
  assert.equal(await readFile(path, 'utf8'), 'preserve this existing file');
});

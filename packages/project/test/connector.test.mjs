import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {requestWithConnector} from '../dist/index.js';

const settings = {adapter: 'linear', values: {team: 'team-id', project: 'project-id'}};
const item = {id: 'item-id', identifier: 'AGE-100', title: 'Project setup', description: 'Scope', labels: ['Story'], status: 'In Progress', teamId: 'team-id', projectId: 'project-id'};
const connected = async (context, handler) => {
  const server = new Server({name: 'tracker-contract-example', version: '1.0.0'}, {capabilities: {tools: {}}});
  server.setRequestHandler(CallToolRequestSchema, async ({params}) => ({content: [{type: 'text', text: JSON.stringify(await handler(params))}]}));
  const client = new Client({name: 'project-host-example', version: '1.0.0'});
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left);
  await client.connect(right);
  context.after(() => Promise.all([client.close(), server.close()]));
  return client;
};

test('real MCP transport translates an update, scopes the item, and returns the neutral model', async (t) => {
  const client = await connected(t, ({name, arguments: args}) => {
    switch (name) {
      case 'get_issue': assert.equal(args.id, 'AGE-100'); return item;
      case 'save_issue': assert.deepEqual(args, {id: 'AGE-100', title: 'Renamed'}); return {...item, title: 'Renamed'};
      default: return assert.fail(`Unexpected connector action ${name}`);
    }
  });
  const result = await requestWithConnector(client, settings, {operation: 'update_work_item', ref: 'AGE-100', changes: {title: 'Renamed'}})();
  assert.equal(result.value.title, 'Renamed');
  assert.equal(result.value.kind, 'user_story');
  assert.equal(result.value.state, 'in_progress');
});

test('an item outside the configured project is rejected before its write', async (t) => {
  const client = await connected(t, ({name}) => {
    assert.equal(name, 'get_issue', 'no write may follow the failed scope check');
    return {...item, projectId: 'different-project'};
  });
  const result = await requestWithConnector(client, settings, {operation: 'transition_work_item', ref: 'AGE-100', state: 'done'})();
  assert.equal(result.error.code, 'outside-project');
});

test('a confirmed artifact revision is reused regardless of input field order', async (t) => {
  const artifact = {content: 'Approved scope', revision: 'r1', title: 'Plan', kind: 'plan'};
  const client = await connected(t, ({name}) => {
    switch (name) {
      case 'get_issue': return item;
      case 'list_comments': return [{body: '<!-- upf-artifact {"kind":"plan","title":"Plan","revision":"r1"} -->\nApproved scope'}];
      default: return assert.fail('a confirmed publication must not be repeated');
    }
  });
  const result = await requestWithConnector(client, settings, {operation: 'publish_artifact', ref: 'AGE-100', artifact})();
  assert.deepEqual(result.value, artifact);
});

test('framework skills use the shared project boundary without tracker details', () => {
  const root = new URL('../../../skills/', import.meta.url);
  readdirSync(root).map((name) => {
    const source = readFileSync(new URL(`${name}/SKILL.md`, root), 'utf8');
    assert.doesNotMatch(source, /\bLinear\b|\bAzure\b|\bwit_\w+|\bget_issue\b|\bsave_issue\b/);
    return name;
  });
});

test('publication reads later comment pages before deciding whether a revision exists', async (t) => {
  const artifact = {kind: 'plan', title: 'Plan', content: 'Approved scope', revision: 'r1'};
  const client = await connected(t, ({name, arguments: args}) => {
    switch (name) {
      case 'get_issue': return item;
      case 'list_comments': return args.cursor === undefined
        ? {comments: [], hasNextPage: true, cursor: 'page-two'}
        : {comments: [{body: '<!-- upf-artifact {"kind":"plan","title":"Plan","revision":"r1"} -->\nApproved scope'}], hasNextPage: false};
      default: return assert.fail('an existing later-page revision must not be republished');
    }
  });
  assert.deepEqual((await requestWithConnector(client, settings, {operation: 'publish_artifact', ref: 'AGE-100', artifact})()).value, artifact);
});

test('parent references are scoped before either creating or moving an item', async (t) => {
  const client = await connected(t, ({name, arguments: args}) => {
    assert.equal(name, 'get_issue', 'an out-of-project parent must prevent every write');
    assert.equal(args.id, 'foreign-parent');
    return {...item, projectId: 'other-project'};
  });
  const create = await requestWithConnector(client, settings, {operation: 'create_work_item', kind: 'task', title: 'Child', description: 'Body', parent: 'foreign-parent'})();
  const update = await requestWithConnector(client, settings, {operation: 'update_work_item', ref: 'AGE-100', changes: {parent: 'foreign-parent'}})();
  assert.equal(create.error.code, 'outside-project');
  assert.equal(update.error.code, 'outside-project');
});

test('installer resolves named Linear scope and refuses a project outside the selected team',async(t)=>{
 const {resolveLinearScopeWithConnector}=await import('../dist/node.js');
 const teamId='11111111-1111-4111-8111-111111111111';const projectId='22222222-2222-4222-8222-222222222222';
 const client=await connected(t,({name,arguments:args})=>{
  assert.equal(typeof args.query,'string');
  return name==='get_team' ? {id:teamId,name:'Team'} : {id:projectId,name:'Project',teams:[{id:teamId}]};
 });
 assert.deepEqual((await resolveLinearScopeWithConnector(client,{team:'Team',project:'Project'})()).value,{team:teamId,project:projectId});
 const foreign=await connected(t,({name})=>name==='get_team' ? {id:teamId} : {id:projectId,teams:[]});
 assert.equal((await resolveLinearScopeWithConnector(foreign,{team:'Team',project:'Other'})()).ok,false);
});

test('tracker readiness accepts an empty or unlabeled issue listing without normalizing business items',async(t)=>{
 const {probeLinearWithConnector}=await import('../dist/node.js');
 const client=await connected(t,({name,arguments:args})=>{
  assert.equal(name,'list_issues');assert.equal(args.project,settings.values.project);assert.equal(args.team,settings.values.team);
  return {issues:[{id:'unlabeled',title:'Existing issue',labels:[]}]};
 });
 assert.equal((await probeLinearWithConnector(client,settings)()).ok,true);
 const broken=await connected(t,()=>({unexpected:'response'}));
 assert.equal((await probeLinearWithConnector(broken,settings)()).ok,false);
});

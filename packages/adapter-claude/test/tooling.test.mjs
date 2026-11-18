import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAUDE_TOOLING, claudeDeclaration, claudeInstalledPlugins, claudeLocalServer, claudeMarketplaceName, claudeServerAction, mergeClaudeMarketplace } from '../dist/tooling.js';

const entries=[{name:'framework',source:'./hosts/claude/framework'}];

test('each project gets its own marketplace, installed at local scope',()=>{
  assert.match(claudeMarketplaceName('/repo/a'),/^upf-[0-9a-f]{12}$/);
  assert.equal(claudeMarketplaceName('/repo/a'),claudeMarketplaceName('/repo/a'));
  assert.notEqual(claudeMarketplaceName('/repo/a'),claudeMarketplaceName('/repo/b'));
  assert.deepEqual(CLAUDE_TOOLING.install('framework','upf-1'),['plugin','install','framework@upf-1','--scope','local','--json']);
  assert.deepEqual(CLAUDE_TOOLING.addMarketplace('/repo/.upf-tools'),['plugin','marketplace','add','/repo/.upf-tools','--scope','local','--json']);
});

test('catalog merge keeps earlier entries and metadata and refuses malformed or moved entries',()=>{
  const first=mergeClaudeMarketplace(null,'upf-1',entries);
  assert.equal(first.value.kind,'write');
  const custom={...first.value.document,owner:{name:'Owner'},plugins:[...first.value.document.plugins,{name:'other',source:'./other'}]};
  assert.equal(mergeClaudeMarketplace(custom,'upf-1',entries).value.kind,'unchanged');
  const second=mergeClaudeMarketplace(custom,'upf-1',[{name:'knowledge',source:'./hosts/claude/knowledge'}]);
  assert.deepEqual(second.value.document.owner,{name:'Owner'});
  assert.deepEqual(second.value.document.plugins.map(({name})=>name),['framework','other','knowledge']);
  [ {...custom,name:'upf-2'}, {...custom,plugins:'none'}, {...custom,plugins:['bad']}, {...custom,plugins:[{name:'framework',source:'./moved'}]}, [] ]
    .map(existing=>assert.equal(mergeClaudeMarketplace(existing,'upf-1',entries).ok,false));
});

test('settings declare the marketplace only for this tools folder',()=>{
  const declared={extraKnownMarketplaces:{'upf-1':{source:{source:'directory',path:'/repo/.upf-tools'}}}};
  assert.equal(claudeDeclaration(null,'upf-1','/repo/.upf-tools'),'absent');
  assert.equal(claudeDeclaration(declared,'upf-1','/repo/.upf-tools'),'declared');
  assert.equal(claudeDeclaration(declared,'upf-1','/other/.upf-tools'),'conflict');
  assert.equal(claudeDeclaration(declared,'upf-2','/repo/.upf-tools'),'absent');
});

test('the knowledge server is registered at local scope and replaced only when another framework checkout owns it',()=>{
  const entry={command:'/repo/.project-knowledge/runtime/bin/upf-project-knowledge',args:['--project','/repo']};
  assert.deepEqual(CLAUDE_TOOLING.addServer(entry),['mcp','add-json','project-knowledge',JSON.stringify({type:'stdio',...entry}),'--scope','local']);
  const state={projects:{'/repo':{mcpServers:{'project-knowledge':{type:'stdio',...entry}}},'/other':{mcpServers:{'project-knowledge':{command:'x'}}}}};
  assert.deepEqual(claudeLocalServer(state,'/repo'),{type:'stdio',...entry});
  [null,{},{projects:{}},state].map((value,index)=>assert.equal(claudeLocalServer(value,'/missing'),undefined,String(index)));
  assert.equal(claudeServerAction(undefined,entry),'add');
  assert.equal(claudeServerAction(claudeLocalServer(state,'/repo'),entry),'keep');
  assert.equal(claudeServerAction({command:'/old/.project-knowledge/runtime/bin/upf-project-knowledge',args:['--project','/old']},entry),'replace');
  [{command:'other'},'bad',null].map(old=>assert.equal(claudeServerAction(old,entry),'conflict'));
});

test('installed plugins are this marketplace\'s, enabled, for exactly this project',()=>{
  const listed=[
    {id:'framework@upf-1',enabled:true,projectPath:'/repo',readFromFolder:'/repo/.upf-tools/hosts/claude/framework'},
    {id:'cached@upf-1',enabled:true,projectPath:'/repo',installPath:'/home/.claude/plugins/cache/cached'},
    {id:'disabled@upf-1',enabled:false,projectPath:'/repo',readFromFolder:'/x'},
    {id:'framework@upf-2',enabled:true,projectPath:'/repo',readFromFolder:'/x'},
    {id:'framework@upf-1',enabled:true,projectPath:'/other',readFromFolder:'/x'},
    {id:'nofolder@upf-1',enabled:true,projectPath:'/repo'},
  ];
  assert.deepEqual(claudeInstalledPlugins(listed,'/repo','upf-1'),[
    {name:'framework',root:'/repo/.upf-tools/hosts/claude/framework'},{name:'cached',root:'/home/.claude/plugins/cache/cached'}]);
  assert.deepEqual(claudeInstalledPlugins({not:'a list'},'/repo','upf-1'),[]);
});

test('hook groups by event form a lawful monoid that keeps first-appearance event order',async()=>{
  const {HOOK_EVENTS}=await import('../dist/index.js');
  const group=command=>({hooks:[{type:'command',command}]});
  const samples=[HOOK_EVENTS.empty,{Stop:[group('a')]},{PreToolUse:[group('b')],Stop:[group('c')]},{PreToolUse:[group('d')]}];
  samples.flatMap(x=>samples.flatMap(y=>samples.map(z=>[x,y,z]))).map(([x,y,z])=>
    assert.deepEqual(HOOK_EVENTS.concat(HOOK_EVENTS.concat(x,y),z),HOOK_EVENTS.concat(x,HOOK_EVENTS.concat(y,z))));
  samples.map(x=>{
    assert.deepEqual(HOOK_EVENTS.concat(HOOK_EVENTS.empty,x),x);
    assert.deepEqual(HOOK_EVENTS.concat(x,HOOK_EVENTS.empty),x);
  });
  const merged=HOOK_EVENTS.concat(samples[1],samples[2]);
  assert.deepEqual(Object.keys(merged),['Stop','PreToolUse']);
  assert.deepEqual(merged.Stop,[group('a'),group('c')]);
});

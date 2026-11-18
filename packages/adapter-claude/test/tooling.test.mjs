import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAUDE_TOOLING, claudeDeclaration, claudeInstalledPlugins, claudeMarketplaceName, mergeClaudeMarketplace, mergeClaudeServer } from '../dist/tooling.js';

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

test('server merge adds, keeps, repoints an owned runtime and refuses anything else',()=>{
  const entry={command:'/repo/.project-knowledge/runtime/bin/upf-project-knowledge',args:['--project','/repo']};
  const added=mergeClaudeServer({mcpServers:{kept:{command:'x'}}},entry);
  assert.deepEqual(added.value.document.mcpServers,{kept:{command:'x'},'project-knowledge':entry});
  assert.equal(mergeClaudeServer(added.value.document,entry).value.kind,'unchanged');
  const moved=mergeClaudeServer({mcpServers:{'project-knowledge':{command:'/old/.project-knowledge/runtime/bin/upf-project-knowledge',args:['--project','/old'],type:'stdio'}}},entry);
  assert.deepEqual(moved.value.document.mcpServers['project-knowledge'],{...entry,type:'stdio'});
  [ {mcpServers:{'project-knowledge':{command:'other'}}}, {mcpServers:'bad'}, {mcpServers:{'project-knowledge':'bad'}}, [] ]
    .map(existing=>assert.equal(mergeClaudeServer(existing,entry).ok,false));
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

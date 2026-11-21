import assert from 'node:assert/strict';
import test from 'node:test';
import { codexToolingRegistration, CODEX_TOOLING, mergeCodexMarketplace } from '../dist/index.js';

const desired={project:'/repo',marketplace:'/repo/.upf-tools',knowledgeCommand:'/repo/.project-knowledge/runtime/bin/upf-project-knowledge'};
test('Codex registration adds only missing tables and accepts existing matching entries',()=>{
  const first=codexToolingRegistration({model:'existing'},desired);
  assert.equal(first.ok,true);
  assert.match(first.value,/mcp_servers.project-knowledge/);
  assert.match(first.value,/marketplaces.upf-project/);
  const existing={marketplaces:{'upf-project':{source_type:'local',source:desired.marketplace}},mcp_servers:{'project-knowledge':{command:desired.knowledgeCommand,args:['--project','/repo']}}};
  assert.equal(codexToolingRegistration(existing,desired).value,'');
  assert.equal(codexToolingRegistration({...existing,mcp_servers:{'project-knowledge':{command:'other'}}},desired).ok,false);
  assert.equal(codexToolingRegistration({...existing,marketplaces:{'upf-project':{source:'different'}}},desired).ok,false);
  assert.equal(codexToolingRegistration({mcp_servers:{'project-knowledge':'invalid'}},desired).ok,false);
  assert.deepEqual(CODEX_TOOLING.install('project-knowledge'),['plugin','add','project-knowledge@upf-project','--json']);
  assert.deepEqual(CODEX_TOOLING.install('project-knowledge','/repo/.upf-tools'),[
    'plugin','add',
    '-c','marketplaces.upf-project.source_type="local"',
    '-c','marketplaces.upf-project.source="/repo/.upf-tools"',
    'project-knowledge@upf-project','--json',
  ]);
});

test('later marketplace setup preserves earlier workflows and unrelated metadata',()=>{
  const first=mergeCodexMarketplace(null,['framework']);
  const custom={...first.value,interface:{displayName:'Owner label'},plugins:[...first.value.plugins,{name:'other',source:{source:'local',path:'./other'},custom:true}]};
  const second=mergeCodexMarketplace(custom,['knowledge']);
  assert.equal(second.ok,true);
  assert.deepEqual(second.value.interface,custom.interface);
  assert.deepEqual(second.value.plugins.slice(0,2),custom.plugins);
  assert.equal(second.value.plugins.length,3);
  assert.equal(mergeCodexMarketplace({...custom,plugins:[{name:'knowledge',source:{source:'local',path:'./different'}}]},['knowledge']).ok,false);
});

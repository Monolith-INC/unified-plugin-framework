import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {collectInstallation} from '../scripts/installer-wizard.mjs';
const questions=answers=>{
 const asked=[];const output=[];
 return {asked,output,io:{ask:async prompt=>{asked.push(prompt);return answers[asked.length-1] ?? '';},say:async message=>{output.push(message);}}};
};
test('fresh wizard collects defaults, asks tracker explicitly and creates its own valid plan',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-'));
 const q=questions(['','','','','','','local','','','','yes']);
 const result=await collectInstallation(q.io,{project,version:'0.2.2'});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.value.plan.answers.tracker.adapter,'local');
 assert.equal(result.value.plan.workflows.length,5);assert.deepEqual(result.value.plan.pluginRoots,[]);
 assert.match(q.output.join('\n'),/No plugin repositories are downloaded/);
});
test('saved settings are reused and declining does not save a plan',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-saved-'));
 const saved={schemaVersion:1,language:'pt-BR',artifactsPath:'plans',tracker:{adapter:'local',values:{}},unrelated:'keep'};
 await writeFile(join(project,'.unified-plugin-framework.json'),JSON.stringify(saved));
 await writeFile(join(project,'.project-knowledge.json'),JSON.stringify({documentMode:'shared',docsRoot:'docs',vaultRoot:'docs',knowledgeRoot:'knowledge'}));
 const q=questions(['','','','','','no']);
 const result=await collectInstallation(q.io,{project,version:'0.2.2'});
 assert.equal(result.error.code,'installation-canceled');assert.equal(q.asked.some(prompt=>prompt.startsWith('Language')),false);
});
test('Linear names go through lookup; failed authentication produces no success or saved choices',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-linear-'));
 const q=questions(['','','','','','','linear','Team','Project']);
 const result=await collectInstallation(q.io,{project,lookup:async names=>{
  assert.deepEqual(names,{team:'Team',project:'Project'});return {ok:false,error:{code:'authentication-needed',message:'Set environment',recovery:'retry'}};
 }});
 assert.equal(result.error.code,'authentication-needed');assert.equal(q.asked.some(prompt=>prompt.includes('Apply')),false);
});
test('invalid choices are re-prompted and existing settings remain part of accepted answers',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-valid-'));
 const saved={schemaVersion:1,language:'pt-BR',artifactsPath:'plans',tracker:{adapter:'local',values:{}},continuity:{journalRoot:'journals'},unrelated:'keep'};
 await writeFile(join(project,'.unified-plugin-framework.json'),JSON.stringify(saved));
 await writeFile(join(project,'.project-knowledge.json'),JSON.stringify({documentMode:'shared',docsRoot:'docs',vaultRoot:'docs',knowledgeRoot:'knowledge'}));
 const q=questions(['','unsupported','codex','invented','continuity','','','yes']);
 const result=await collectInstallation(q.io,{project,version:'0.2.2'});
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.value.plan.workflows,['continuity']);
 assert.equal(result.value.plan.answers.unrelated,'keep');assert.deepEqual(result.value.plan.answers.continuity,{journalRoot:'journals'});
 assert.equal(q.output.filter(line=>line==='Please enter a valid value.').length,2);
});
test('malformed saved settings stop collection and never imply a new default configuration',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-invalid-'));
 await writeFile(join(project,'.unified-plugin-framework.json'),'{invalid');
 const q=questions(['']);const result=await collectInstallation(q.io,{project});
 assert.equal(result.error.code,'unreadable-settings');assert.equal(q.asked.length,1);
});
test('a partial saved Linear tracker resolves only missing scope and preserves connection choices',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-partial-'));
 const team='11111111-1111-4111-8111-111111111111';const projectId='22222222-2222-4222-8222-222222222222';
 const connection={url:'https://mcp.linear.app/mcp',tokenEnv:'PROJECT_LINEAR_TOKEN'};
 await writeFile(join(project,'.unified-plugin-framework.json'),JSON.stringify({language:'en',artifactsPath:'docs',tracker:{adapter:'linear',values:{team},connection}}));
 const q=questions(['','','','','','Project','','','','yes']);
 const result=await collectInstallation(q.io,{project,lookup:async(names,current)=>{
  assert.deepEqual(names,{team,project:'Project'});assert.deepEqual(current.connection,connection);
  return {ok:true,value:{team,project:projectId}};
 }});
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.value.plan.answers.tracker.connection,connection);
 assert.equal(q.asked.some(prompt=>prompt.startsWith('Linear team')),false);
});
test('saved workflow and Python choices are used as defaults and malformed saved plans fail explicitly',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-wizard-plan-'));const {mkdir}=await import('node:fs/promises');
 await mkdir(join(project,'.upf-tools'));
 const saved={host:'codex',python:'python3.13',workflows:['continuity'],pluginRoots:[],knowledge:{knowledgeRoot:'knowledge',documentMode:'shared',docsRoot:'docs',vaultRoot:'docs'}};
 await writeFile(join(project,'.upf-tools/setup-plan.json'),JSON.stringify(saved));
 const q=questions(['','','','','','','local','','','','no']);await collectInstallation(q.io,{project});
 assert.equal(q.asked.some(prompt=>prompt==='Python 3.12+ executable [python3.13]: '),true);
 assert.equal(q.asked.some(prompt=>prompt==='Workflows (comma-separated) [continuity]: '),true);
 await writeFile(join(project,'.upf-tools/setup-plan.json'),'{}');
 assert.equal((await collectInstallation(questions(['']).io,{project})).error.code,'invalid-saved-plan');
});

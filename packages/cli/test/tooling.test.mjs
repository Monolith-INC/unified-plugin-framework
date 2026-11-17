import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {parseBootstrap} from '../dist/tooling-input.js';
import {safePath,writeText} from '../dist/tooling-files.js';
import {configureReview,reviewBindingsValid,wireCli,installedCli} from '../dist/tooling-runtime.js';
import {nodeToolingIO} from '../dist/tooling-node.js';
import {stageDependency} from '../dist/tooling-host.js';
import {readContentTree} from '../dist/plugin-reader.js';

const choices={host:'codex',python:'python3.12',workflows:[],pluginRoots:[],knowledge:{knowledgeRoot:'knowledge',documentMode:'shared',docsRoot:'docs',vaultRoot:'docs'},steps:['settings','knowledge-settings'],answers:{language:'en',artifactsPath:'docs/work-items',tracker:{adapter:'local',values:{}}}};
const cli=fileURLToPath(new URL('../dist/index.js',import.meta.url));
test('bootstrap parses supported choices and rejects escaping roots, unknown workflows and hosts',()=>{
  assert.equal(parseBootstrap(choices).ok,true);
  [ {...choices,host:'unsupported'}, {...choices,workflows:['invented']}, {...choices,knowledge:{...choices.knowledge,knowledgeRoot:'../outside'}}, {...choices,steps:['unknown']} ].map(value=>assert.equal(parseBootstrap(value).ok,false));
});
test('CLI plan is read-only; apply configures missing accepted choices and re-entry preserves them',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-bootstrap-'));
  const input=join(project,'plan.json');await writeFile(input,JSON.stringify(choices));
  const run=(apply=false)=>JSON.parse(execFileSync(process.execPath,[cli,'project','bootstrap','--input',input,'--project',project,...(apply?['--apply']:[])],{encoding:'utf8'}));
  assert.equal(run().value.tooling.status,'action-required');
  await assert.rejects(readFile(join(project,'.unified-plugin-framework.json')));
  assert.equal(run(true).value.tooling.status,'ready');
  const before=await readFile(join(project,'.unified-plugin-framework.json'),'utf8');
  assert.equal(run(true).value.tooling.status,'ready');
  assert.equal(await readFile(join(project,'.unified-plugin-framework.json'),'utf8'),before);
  const old=JSON.parse(before);await writeFile(join(project,'.unified-plugin-framework.json'),JSON.stringify({...old,language:'pt-BR',artifactsPath:'old'}));
  assert.equal(run().value.tooling.steps.find(step=>step.step==='settings').status,'action-required');
  assert.equal(run(true).value.tooling.status,'ready');
  assert.equal(JSON.parse(await readFile(join(project,'.unified-plugin-framework.json'),'utf8')).language,'en');
});

test('review setup refuses incomplete bindings and preserves linked external configuration',{skip:process.platform==='win32'},async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-review-'));
  await mkdir(join(project,'.monolithic-code-review'));
  const path=join(project,'.monolithic-code-review','sources.json');await writeFile(path,'{}');
  assert.equal((await configureReview(project,choices)).error.code,'review-setup-needed');
  assert.equal(await readFile(path,'utf8'),'{}');
  assert.equal((await nodeToolingIO(project,choices).inspect('review')()).value.status,'missing');
  assert.equal(reviewBindingsValid({knowledge:{root:'knowledge'}}),false);
  const linkedProject=await mkdtemp(join(tmpdir(),'upf-review-linked-'));
  await symlink(join(project,'.monolithic-code-review'),join(linkedProject,'.monolithic-code-review'));
  assert.equal((await configureReview(linkedProject,choices)).ok,false);
  assert.equal(await readFile(path,'utf8'),'{}');
});

test('interrupted staging cannot leave the final wrapper partial and retry can publish it',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-stage-'));
  const source=join(project,'source');
  assert.equal((await stageDependency(project,'fixture',source)).ok,false);
  await mkdir(join(source,'skills','one'),{recursive:true});await writeFile(join(source,'skills','one','SKILL.md'),'Original');
  const result=await stageDependency(project,'fixture',source);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(await readFile(join(result.value,'source','skills','one','SKILL.md'),'utf8'),'Original');
});

test('active skill verification covers referenced files and ignores only the owned marker',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-active-skill-'));
  await writeFile(join(project,'SKILL.md'),'Original');await writeFile(join(project,'reference.md'),'Rule');
  const original=readContentTree(project);
  await writeFile(join(project,'.upf-source'),'owner@version');
  assert.deepEqual(readContentTree(project),original);
  await writeFile(join(project,'reference.md'),'Edited rule');
  assert.notEqual(readContentTree(project).value,original.value);
});
test('setup writes reject stale content and preserve unrelated configuration',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-bootstrap-write-'));
  const path=join(project,'config','settings.txt');await mkdir(join(project,'config'));await writeFile(path,'original');
  assert.equal((await writeText(project,path,'new','stale')).ok,false);
  assert.equal(await readFile(path,'utf8'),'original');
  assert.equal((await writeText(project,path,'new','original')).ok,true);
  assert.equal(await readFile(path,'utf8'),'new');
  assert.equal(await safePath(project,join(project,'..','outside')),false);
});
test('setup paths cannot traverse a linked directory',{skip:process.platform==='win32'},async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-bootstrap-links-'));
  const outside=await mkdtemp(join(tmpdir(),'upf-bootstrap-outside-'));
  await symlink(outside,join(project,'linked'));
  assert.equal(await safePath(project,join(project,'linked','file')),false);
});

test('bootstrap holds a saved request while incomplete and applies it once after required setup',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-bootstrap-resume-'));
  const input=join(project,'plan.json');await writeFile(input,JSON.stringify(choices));
  const request=join(project,'request.json');await writeFile(request,JSON.stringify({operation:'create_work_item',kind:'user_story',title:'Resume this saved request',description:'One accepted create.'}));
  const argv=[cli,'project','bootstrap','--input',input,'--resume',request,'--project',project];
  const planned=JSON.parse(execFileSync(process.execPath,argv,{encoding:'utf8'}));
  assert.equal(planned.value.request.title,'Resume this saved request');
  await assert.rejects(readFile(join(project,'.unified-plugin-framework','items.json')));
  const applied=JSON.parse(execFileSync(process.execPath,[...argv,'--apply'],{encoding:'utf8'}));
  assert.equal(applied.value.resumed.status,'completed');
  assert.equal(JSON.parse(await readFile(join(project,'.unified-plugin-framework','items.json'),'utf8')).length,1);
});

test('owned CLI can move to a new release while unmanaged or edited launchers are preserved',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-cli-upgrade-'));
  const first=new URL('file:///first-release/index.js');const second=new URL('file:///second-release/index.js');
  assert.equal((await wireCli(project,first)).ok,true);
  assert.equal(await installedCli(project,first),true);
  assert.equal(await installedCli(project,second),false);
  assert.equal((await wireCli(project,second)).ok,true);
  assert.equal(await installedCli(project,second),true);
  const path=join(project,'.upf-tools/bin/agent-plugin');await writeFile(path,'unmanaged');
  assert.equal((await wireCli(project,first)).ok,false);
  assert.equal(await readFile(path,'utf8'),'unmanaged');
});

test('an empty local tracker is verified by read-only search without creating a work item',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-empty-local-'));
 await writeFile(join(project,'.unified-plugin-framework.json'),JSON.stringify({schemaVersion:1,language:'en',artifactsPath:'docs',tracker:{adapter:'local',values:{}}}));
 const observed=await nodeToolingIO(project,choices).inspect('tracker')();
 assert.equal(observed.ok,true,JSON.stringify(observed));assert.equal(observed.value.status,'ready');
 await assert.rejects(readFile(join(project,'.unified-plugin-framework/items.json')));
});

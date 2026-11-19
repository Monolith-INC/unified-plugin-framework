import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,readdir,rename,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {parseBootstrap} from '../dist/tooling-input.js';
import {safePath,sweepSetupWrites,writeText} from '../dist/tooling-files.js';
import {configureReview,reviewBindingsValid,wireCli,installedCli,prepareKnowledgeRuntime} from '../dist/tooling-runtime.js';
import {nodeToolingIO} from '../dist/tooling-node.js';
import {stageDependency} from '../dist/tooling-host.js';
import {readContentTree} from '../dist/plugin-reader.js';

const choices={host:'codex',python:'python3.12',workflows:['continuity'],pluginRoots:[],knowledge:{knowledgeRoot:'knowledge',documentMode:'shared',docsRoot:'docs',vaultRoot:'docs'},steps:['settings','knowledge-settings'],answers:{language:'en',artifactsPath:'docs/work-items',tracker:{adapter:'local',values:{}}}};
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
  assert.deepEqual((await readdir(project)).sort(),['plan.json']);
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

test('bootstrap without discovery consent reports the knowledge hand-off with exit code 2',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-discovery-handoff-'));
  const state=await mkdtemp(join(tmpdir(),'upf-discovery-receipts-'));
  const options={encoding:'utf8',env:{...process.env,XDG_STATE_HOME:state}};
  const input=join(project,'plan.json');
  await writeFile(input,JSON.stringify({...choices,steps:['knowledge-content']}));
  const argv=[cli,'project','bootstrap','--input',input,'--project',project];
  const dry=spawnSync(process.execPath,argv,options);
  assert.equal(dry.status,0,dry.stderr);
  const apply=spawnSync(process.execPath,[...argv,'--apply'],options);
  assert.equal(apply.status,2,apply.stderr);
  const {value}=JSON.parse(apply.stdout);
  assert.equal(value.tooling.steps[0].failure.code,'knowledge-discovery-needed');
  assert.match(value.next,/Use the project-bootstrap skill to finish setup/);
  const handoffs=[cli,'project','handoffs','--project',project];
  const runHandoffs=(...extra)=>JSON.parse(execFileSync(process.execPath,[...handoffs,...extra],options)).value;
  assert.deepEqual(runHandoffs().tasks,['knowledge-discovery']);
  const claimed=runHandoffs('--claim','knowledge-discovery');
  assert.equal(claimed.status,'claimed');
  assert.equal(runHandoffs('--task','knowledge-discovery','--finish',claimed.token).status,'not-ready');
  assert.equal(runHandoffs('--claim','knowledge-discovery').status,'busy');
  assert.equal(spawnSync(process.execPath,[...handoffs,'--claim','unrecognized'],options).status,1);
  await writeFile(value.pendingTasks,JSON.stringify({version:1,tasks:['review-setup']}));
  assert.equal(runHandoffs().status,'ignored');
  await assert.rejects(readFile(join(project,'knowledge','.upf-discovery-complete')));
});

test('review setup refuses incomplete bindings and preserves linked external configuration',{skip:process.platform==='win32'},async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-review-'));
  await mkdir(join(project,'.monolithic-code-review'));
  const path=join(project,'.monolithic-code-review','sources.json');await writeFile(path,'{}');
  assert.equal((await configureReview(project,choices)).error.code,'review-setup-needed');
  assert.equal(await readFile(path,'utf8'),'{}');
  assert.equal((await nodeToolingIO(project,choices,{claudeState:join(project,'.claude.json')}).inspect('review')()).value.status,'missing');
  assert.equal(reviewBindingsValid({knowledge:{root:'knowledge'}}),false);
  const linkedProject=await mkdtemp(join(tmpdir(),'upf-review-linked-'));
  await symlink(join(project,'.monolithic-code-review'),join(linkedProject,'.monolithic-code-review'));
  assert.equal((await configureReview(linkedProject,choices)).ok,false);
  assert.equal(await readFile(path,'utf8'),'{}');
});

test('interrupted staging cannot leave the final wrapper partial and retry can publish it',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-stage-'));
  const source=join(project,'source');
  assert.equal((await stageDependency(project,'fixture',source)).ok,false);
  await mkdir(join(source,'skills','one'),{recursive:true});await writeFile(join(source,'skills','one','SKILL.md'),'Original');
  const result=await stageDependency(project,'fixture',source);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(await readFile(join(result.value,'source','skills','one','SKILL.md'),'utf8'),'Original');
});

test('dependency staging reports an unmanaged wrapper and preserves its files',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-stage-preserve-'));
  const target=join(project,'.upf-tools/plugins/fixture');
  const existing=join(target,'notes.md');
  await mkdir(target,{recursive:true});
  await writeFile(existing,'user contents');
  assert.equal((await stageDependency(project,'fixture',join(project,'source'))).error.code,'unmanaged-file');
  assert.equal(await readFile(existing,'utf8'),'user contents');
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
test('setup writes reject stale content and preserve unrelated configuration',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-bootstrap-write-'));
  const path=join(project,'config','settings.txt');await mkdir(join(project,'config'));await writeFile(path,'original');
  assert.equal((await writeText(project,path,'new','stale')).error.code,'modified-file');
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
  assert.equal((await writeText(project,join(project,'linked','file'),'unsafe',null)).error.code,'symlink-escape');
  await assert.rejects(readFile(join(outside,'file')));
});

test('an existing setup lock reports a busy write and preserves the file',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-write-busy-'));
  const path=join(project,'settings.json');
  await writeFile(path,'original');
  await writeFile(`${path}.upf.lock`,'owner');
  assert.equal((await writeText(project,path,'new','original')).error.code,'write-busy');
  assert.equal(await readFile(path,'utf8'),'original');
});

test('a killed lock owner releases its lease without deleting user files',{skip:process.platform==='win32',timeout:10000},async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-write-restart-'));
  const path=join(project,'settings.json');
  const neighbor=join(project,'settings.json.upf-user.tmp');
  const locks=join(project,'.upf-tools','write-locks');
  const key=createHash('sha256').update('settings.json').digest('hex');
  await mkdir(locks,{recursive:true,mode:0o700});
  await Promise.all([writeFile(path,'original'),writeFile(neighbor,'user contents')]);
  const child=spawn('python3',['-I','-c','import fcntl,sys,time; lock=open(sys.argv[1],"w"); fcntl.flock(lock,fcntl.LOCK_EX); print("locked",flush=True); time.sleep(30)',join(locks,key)],{stdio:['ignore','pipe','inherit']});
  const exited=once(child,'exit');
  try {
    await once(child.stdout,'data');
    assert.equal((await writeText(project,path,'new','original')).error.code,'write-busy');
    assert.equal(await readFile(path,'utf8'),'original');
  } finally {
    child.kill('SIGKILL');
    await exited;
  }
  assert.equal((await writeText(project,path,'new','original')).ok,true);
  assert.equal(await readFile(path,'utf8'),'new');
  assert.equal(await readFile(neighbor,'utf8'),'user contents');
});

test('rerun sweeps an interrupted writer temporary file with a matching receipt',{skip:process.platform==='win32',timeout:10000},async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-interrupted-write-'));
  const path=join(project,'settings.json');
  const neighbor=join(project,'settings.json.upf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.tmp');
  const writer=fileURLToPath(new URL('../../../runtimes/project-knowledge/src/upf_knowledge/setup_write.py',import.meta.url));
  await Promise.all([writeFile(path,'original'),writeFile(neighbor,'user contents')]);
  const delayed=`import importlib.util, os, sys, time
from pathlib import Path
spec = importlib.util.spec_from_file_location("setup_writer", sys.argv[1])
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)
def pause(*args, **kwargs):
    print("staged", flush=True)
    time.sleep(30)
os.replace = pause
writer.update(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve(), "new", "original")
`;
  const child=spawn('python3',['-IB','-c',delayed,writer,project,path],{stdio:['ignore','pipe','inherit']});
  const exited=once(child,'exit');
  try {
    await once(child.stdout,'data');
    assert.equal(await readFile(path,'utf8'),'original');
    assert.equal((await readdir(project)).filter(name=>name.endsWith('.tmp')).length,2);
  } finally {
    child.kill('SIGKILL');
    await exited;
  }
  assert.equal((await sweepSetupWrites(project,'python3')).ok,true);
  assert.deepEqual((await readdir(project)).filter(name=>name.endsWith('.tmp')),[neighbor.split('/').at(-1)]);
  assert.equal(await readFile(path,'utf8'),'original');
  assert.equal((await writeText(project,path,'new','original')).ok,true);
  assert.equal(await readFile(neighbor,'utf8'),'user contents');
});

test('startup moves an interrupted stage aside and preserves its contents',{skip:process.platform==='win32',timeout:10000},async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-stage-restart-'));
  const writer=fileURLToPath(new URL('../../../runtimes/project-knowledge/src/upf_knowledge/setup_write.py',import.meta.url));
  const staging=join(project,'.upf-tools','staging');
  await mkdir(staging,{recursive:true});
  const unrelated=join(staging,'unmanaged');
  await mkdir(unrelated);
  const child=spawn('python3',['-I',writer,project,'--stage'],{stdio:['pipe','pipe','inherit']});
  const exited=once(child,'exit');
  try {
    const [bytes]=await once(child.stdout,'data');
    const stage=join(staging,bytes.toString().trim());
    await writeFile(join(stage,'partial-copy.md'),'keep these bytes');
    assert.equal((await sweepSetupWrites(project,'python3')).ok,true);
    assert.equal(await readFile(join(stage,'partial-copy.md'),'utf8'),'keep these bytes');
  } finally {
    child.kill('SIGKILL');
    await exited;
  }
  assert.equal((await sweepSetupWrites(project,'python3')).ok,true);
  const entries=await readdir(staging);
  assert.equal(entries.some(name=>name.startsWith('stage-')),false);
  const moved=entries.find(name=>name.startsWith('recovered-'));
  assert.equal(await readFile(join(staging,moved,'partial-copy.md'),'utf8'),'keep these bytes');
  assert.deepEqual(await readdir(unrelated),[]);
});

test('a marked runtime resumes, but a replacement directory is preserved',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-runtime-ownership-'));
  const first=await prepareKnowledgeRuntime(project,'python3');
  assert.equal(first.ok,true,JSON.stringify(first));
  await writeFile(join(first.value,'interrupted.txt'),'installer progress');
  assert.deepEqual(await prepareKnowledgeRuntime(project,'python3'),first);
  await rename(first.value,`${first.value}-previous`);
  await mkdir(first.value);
  await writeFile(join(first.value,'notes.md'),'user contents');
  assert.equal((await prepareKnowledgeRuntime(project,'python3')).error.code,'unmanaged-file');
  assert.equal(await readFile(join(first.value,'notes.md'),'utf8'),'user contents');
});

test('bootstrap holds a saved request while incomplete and applies it once after required setup',async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-bootstrap-resume-'));
  const input=join(project,'plan.json');await writeFile(input,JSON.stringify({...choices,hosts:['codex','claude']}));
  const request=join(project,'request.json');await writeFile(request,JSON.stringify({operation:'create_work_item',kind:'user_story',title:'Resume this saved request',description:'One accepted create.'}));
  const argv=[cli,'project','bootstrap','--input',input,'--resume',request,'--project',project];
  const planned=JSON.parse(execFileSync(process.execPath,argv,{encoding:'utf8'}));
  assert.equal(planned.value.request.title,'Resume this saved request');
  await assert.rejects(readFile(join(project,'.unified-plugin-framework','items.json')));
  const applied=JSON.parse(execFileSync(process.execPath,[...argv,'--apply'],{encoding:'utf8'}));
  assert.equal(applied.value.resumed.status,'completed');
  assert.deepEqual(applied.value.hosts.map(({host,status})=>[host,status]),[['codex','not-verified'],['claude','not-verified']]);
  assert.equal(applied.value.status,'not-verified');
  assert.equal(JSON.parse(await readFile(join(project,'.unified-plugin-framework','items.json'),'utf8')).length,1);
});

test('owned CLI can move to a new release while unmanaged or edited launchers are preserved',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-cli-upgrade-'));
  const first=new URL('file:///first-release/index.js');const second=new URL('file:///second-release/index.js');
  assert.equal((await wireCli(project,first)).ok,true);
  const old=await readFile(join(project,'.upf-tools/bin/agent-plugin'));
  assert.equal(await installedCli(project,first),true);
  assert.equal(await installedCli(project,second),false);
  assert.equal((await wireCli(project,second)).ok,true);
  assert.equal(await installedCli(project,second),true);
  const bin=join(project,'.upf-tools/bin');
  const ledger=JSON.parse(await readFile(join(project,'.upf-tools/owned.json'),'utf8'));
  assert.equal(ledger.entries['.upf-tools/bin/agent-plugin'],createHash('sha256').update(await readFile(join(bin,'agent-plugin'))).digest('hex'));
  const backups=(await readdir(bin)).filter(name=>name.startsWith('agent-plugin.upf-backup-'));
  assert.equal(backups.length,1);
  assert.deepEqual(await readFile(join(bin,backups[0])),old);
  if(process.platform!=='win32') assert.equal((await stat(join(bin,backups[0]))).mode & 0o777,0o600);
  const path=join(project,'.upf-tools/bin/agent-plugin');await writeFile(path,'unmanaged');
  assert.equal((await wireCli(project,first)).ok,false);
  assert.equal(await readFile(path,'utf8'),'unmanaged');
});

test('the ownership ledger can migrate an existing valid launcher receipt',{ skip: process.platform === 'win32' }, async()=>{
  const project=await mkdtemp(join(tmpdir(),'upf-legacy-receipt-'));
  const bin=join(project,'.upf-tools/bin');
  const path=join(bin,'agent-plugin');
  const prior='previously installed launcher\n';
  await mkdir(bin,{recursive:true});
  await Promise.all([writeFile(path,prior),writeFile(`${path}.sha256`,createHash('sha256').update(prior).digest('hex'))]);
  assert.equal((await wireCli(project,new URL('file:///new-release/index.js'))).ok,true);
  const {entries}=JSON.parse(await readFile(join(project,'.upf-tools/owned.json'),'utf8'));
  assert.equal(entries['.upf-tools/bin/agent-plugin'],createHash('sha256').update(await readFile(path)).digest('hex'));
});

test('an empty local tracker is verified by read-only search without creating a work item',async()=>{
 const project=await mkdtemp(join(tmpdir(),'upf-empty-local-'));
 await writeFile(join(project,'.unified-plugin-framework.json'),JSON.stringify({schemaVersion:1,language:'en',artifactsPath:'docs',tracker:{adapter:'local',values:{}}}));
 const observed=await nodeToolingIO(project,choices,{claudeState:join(project,'.claude.json')}).inspect('tracker')();
 assert.equal(observed.ok,true,JSON.stringify(observed));assert.equal(observed.value.status,'ready');
 await assert.rejects(readFile(join(project,'.unified-plugin-framework/items.json')));
});

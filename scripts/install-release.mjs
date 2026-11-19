#!/usr/bin/env node
// Standalone installation edge. It only places a verified distribution and invokes the shared bootstrap.
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, readlinkSync} from 'node:fs';
import {appendFile, chmod, cp, link, mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo='Monolith-INC/unified-plugin-framework';
const PYTHON_VERSION='3.12.16';
const UV=Object.freeze({version:'0.13.7',archives:Object.freeze({
 'x86_64-unknown-linux-gnu':'c5221ff41b7892bfc223543883600125f6a47fe845093e0f5bdff4f359196d83',
 'aarch64-unknown-linux-gnu':'71279f8d3c67241e807b9d8db872d1bf541579fb9f08b7d1eb1682196d1e57dc',
 'x86_64-unknown-linux-musl':'287491da03f2a785c70fa75b13e1f849918c2f2b5415fe84876b8214eeb792f9',
 'aarch64-unknown-linux-musl':'2d3ec076a0c4c0e8250bb6418c44080828b544f1a3be0b6e46adf9fb6923de45',
 'x86_64-apple-darwin':'20c47e4c1f630b8abaff8c291fa9b9aa300fef92c4fbff95adf198b55287cda7',
 'aarch64-apple-darwin':'81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731'})});
const usage='Interactive: node install.mjs [--project <project>] [--version <version>]\nAutomation: node install.mjs --input <accepted-plan.json> --project <project> [--version <version>]\nLocal archive: --source <archive> --checksums <SHA256SUMS>\nPython executable: --python <python3.12+>';
const stop=message=>{throw new Error(message);}; // Boundary: report installation failures once without partial activation.
const options=args=>parseArgs({args,options:{help:{type:'boolean'},strict:{type:'boolean'},version:{type:'string'},dest:{type:'string'},project:{type:'string'},input:{type:'string'},source:{type:'string'},checksums:{type:'string'},python:{type:'string'}},strict:true}).values;
const NODE_IO=Object.freeze({env:process.env,platform:process.platform,arch:process.arch,libc:process.report?.getReport?.().header?.glibcVersionRuntime?'gnu':'musl',
 nodeVersion:process.versions.node,stdinIsTTY:process.stdin.isTTY,
 stdoutIsTTY:process.stdout.isTTY,cwd:()=>process.cwd(),fetch:(...args)=>fetch(...args),spawnSync:(...args)=>spawnSync(...args),
 spawn:(...args)=>spawn(...args),execFileSync:(...args)=>execFileSync(...args),writeStdout:text=>process.stdout.write(text),writeStderr:text=>process.stderr.write(text),
 ask:prompt=>{const terminal=createInterface({input:process.stdin,output:process.stdout});return terminal.question(prompt).finally(()=>terminal.close());},
 sleep:milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)),now:()=>Date.now(),
 processAlive:pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}},killGroup:(pid,signal)=>process.kill(-pid,signal)});
const inspectTree=root=>readdirSync(root).toSorted().flatMap(name=>{
 const path=join(root,name);const stat=lstatSync(path);
 return stat.isSymbolicLink() ? [[name,`link:${readlinkSync(path)}`]] : stat.isDirectory()
  ? inspectTree(path).map(([child,hash])=>[`${name}/${child}`,hash]) : [[name,digest(readFileSync(path))]];
});
const checkedAncestors=(project,target)=>{
 const relative=target.slice(project.length+1).split(/[\\/]/);
 return relative.every((_,index)=>{
  const path=join(project,...relative.slice(0,index+1));
  const stat=lstatSync(path,{throwIfNoEntry:false});
  return stat===undefined || stat.isDirectory() && !stat.isSymbolicLink();
 });
};
const retryDelay=attempt=>[250,750][attempt] ?? 1500;
const retryable=(error)=>error?.status===429 || error?.status>=500 || error instanceof TypeError || error?.name==='TimeoutError';
const retryDownload=async(operation,url,accept,io,attempt=0)=>{
 const result=await operation().then(response=>({response}),error=>({error}));
 if(result.error===undefined && result.response.ok) return Buffer.from(await result.response.arrayBuffer());
 const failure=result.error ?? Object.assign(new Error(`Could not download ${url} (HTTP ${result.response.status}).`),{status:result.response.status});
 return attempt>=2 || !retryable(failure) ? stop(`Download failed after ${attempt+1} attempt(s): ${url} (${failure.status ?? failure.message}); nothing installed.`)
  : io.sleep(retryDelay(attempt)).then(()=>retryDownload(operation,url,accept,io,attempt+1));
};
export const downloadBytes=(url,accept='application/octet-stream',io=NODE_IO)=>retryDownload(
 ()=>io.fetch(url,{signal:AbortSignal.timeout(60_000),headers:{Accept:accept}}),url,accept,io);
const get=downloadBytes;
const latest=io=>get('https://api.github.com/repos/'+repo+'/releases/latest','application/vnd.github+json',io).then(bytes=>JSON.parse(bytes.toString('utf8')).tag_name);
const download=async(version,scratch,io)=>{
 const base=`https://github.com/${repo}/releases/download/v${version}`;
 const archive=join(scratch,`unified-plugin-framework-${version}.tar.gz`);
 const checksums=join(scratch,'SHA256SUMS');
 await Promise.all([[archive,`${base}/unified-plugin-framework-${version}.tar.gz`],[checksums,`${base}/SHA256SUMS`]].map(async([path,url])=>writeFile(path,await get(url,'application/octet-stream',io))));
 return {archive,checksums};
};
const verify=async(files,version)=>{
 const entries=(await readFile(files.checksums,'utf8')).trim().split(/\r?\n/).filter(line=>line.endsWith(`  unified-plugin-framework-${version}.tar.gz`));
 const expected=entries.length===1 ? entries[0].split('  ')[0] : '';
 return /^[a-f0-9]{64}$/.test(expected) && digest(await readFile(files.archive))===expected
  ? files.archive : stop('Archive checksum mismatch or missing unique checksum; nothing installed.');
};
const pythonExecutable=(preferred,io)=>{
 const candidates=preferred===undefined ? ['python3.12','python3','python3.13','python3.14'] : [preferred];
 const selected=candidates.find(program=>io.spawnSync(program,['-c','import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)'],{stdio:'ignore',timeout:10_000}).status===0);
 return selected ?? null;
};
// Python's data extraction filter validates member paths and link targets before writes.
const extract=(python,archive,scratch,version,io)=>{
 const destination=join(scratch,'extract');
 io.execFileSync(python,['-c',`import pathlib,sys,tarfile
archive,destination,version=sys.argv[1:]
with tarfile.open(archive) as source:
 members=source.getmembers()
 expected='unified-plugin-framework-'+version
 assert all(pathlib.PurePosixPath(m.name).parts[0]==expected for m in members), 'unexpected archive root'
 tuple(tarfile.data_filter(member,destination) for member in members)
 base=(pathlib.Path(destination)/expected).resolve()
 assert all(not m.issym() or (pathlib.Path(destination)/m.name).parent.joinpath(m.linkname).resolve().is_relative_to(base) for m in members), 'link escapes distribution'
 source.extractall(destination,filter='data')
`,archive,destination,version],{stdio:'inherit',timeout:120_000});
 return join(destination,`unified-plugin-framework-${version}`);
};
const publish=async(source,target)=>{
 return existsSync(target) ? JSON.stringify(inspectTree(source))===JSON.stringify(inspectTree(target)) ? target
  : stop('Existing distribution differs from this verified release; preserve it and choose a clean installation location.')
  : mkdir(dirname(target),{recursive:true}).then(()=>rename(source,target)).then(()=>target);
};
const runMain=async(args,io)=>{
 const parsed=options(args);
 return parsed.help ? {ok:true,message:`${usage}\n`,exitCode:0}
  : Number(io.nodeVersion.split('.')[0])<22 ? stop('Node.js 22+ is required.')
  : parsed.input===undefined && (!io.stdinIsTTY || !io.stdoutIsTTY) ? stop('Interactive installation needs a terminal. Run the one-command installer in a terminal or supply --input for automation.')
    : prepare(parsed,io);
};
export const main=async(args,io=NODE_IO)=>{
 try {
  const result=await runMain(args,io);
  io.writeStdout(`${JSON.stringify(result)}\n`);
  return result.exitCode ?? 0;
 } catch(error) {
  io.writeStderr(`${error instanceof Error ? error.message : 'Unexpected installer failure.'}\n`);
  return 1;
 }
};
const prepare=async(args,io)=>{
 const acceptedPlan=args.input===undefined ? null : await readFile(resolve(args.input),'utf8').then(JSON.parse).catch(()=>null);
 const python=pythonExecutable(args.python ?? acceptedPlan?.python,io);
 const consented=python!==null ? true : acceptedPlan?.consent?.privatePython===true || args.input===undefined && await privatePythonConsent(args,io);
 if(!consented) return stop('A private Python 3.12 installation requires explicit consent; no project files were changed.');
 const privateRuntime=python===null ? await installPrivatePython(args,io) : null;
 try {
  const version=String(args.version ?? io.env.UPF_VERSION ?? await latest(io)).replace(/^v/,'');
  return !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version) || args.project!==undefined && args.dest!==undefined
   ? stop(usage) : await install({...args,version,python,privateRuntime,extractionPython:python ?? privateRuntime.python,project:args.project ?? args.dest ?? io.cwd()},io);
 } finally {
  if(privateRuntime!==null) await rm(privateRuntime.scratch,{recursive:true,force:true});
 }
};
const privatePythonConsent=async(args,io)=>args.input!==undefined
 ? readFile(resolve(args.input),'utf8').then(JSON.parse).then(plan=>plan.consent?.privatePython===true).catch(()=>false)
 : io.ask('Python 3.12+ is unavailable. Allow the installer to add a private Python 3.12.16? yes/no: ').then(answer=>answer.trim().toLowerCase()==='yes');
const uvTriple=io=>io.platform==='darwin' ? `${io.arch==='arm64'?'aarch64':'x86_64'}-apple-darwin`
 : io.platform==='linux' ? `${io.arch==='arm64'?'aarch64':'x86_64'}-unknown-linux-${io.libc}` : null;
const uvEnvironment=(base,scratch,pythonRoot)=>Object.freeze({
 ...Object.fromEntries(Object.entries(base).filter(([key])=>['PATH','HOME','TMPDIR','SSL_CERT_FILE','SSL_CERT_DIR','SYSTEMROOT','WINDIR'].includes(key))),
 UV_NO_CONFIG:'1',UV_CACHE_DIR:join(scratch,'cache'),UV_PYTHON_INSTALL_DIR:pythonRoot,
 UV_PYTHON_BIN_DIR:pythonRoot,UV_PYTHON_PREFERENCE:'only-managed',
});
const installPrivatePython=async(args,io)=>{
 const triple=uvTriple(io);
 const expected=UV.archives[triple];
 return triple===null || expected===undefined ? stop('Private Python is unsupported on this platform; no project files were changed.')
  : installPinnedPython(triple,expected,io);
};
const installPinnedPython=async(triple,expected,io)=>{
 const scratch=await mkdtemp(join(tmpdir(),'upf-private-python-'));
 try {
 const archive=join(scratch,`uv-${triple}.tar.gz`);
 const url=`https://github.com/astral-sh/uv/releases/download/${UV.version}/uv-${triple}.tar.gz`;
 const bytes=await downloadBytes(url,'application/octet-stream',io);
 if(digest(bytes)!==expected) return stop('Pinned uv checksum mismatch; private Python was not installed.');
 await writeFile(archive,bytes);
 const extracted=join(scratch,'uv-extract');
 const pythonRoot=join(scratch,'python');
 await mkdir(extracted);
 const env=uvEnvironment(io.env,scratch,pythonRoot);
 io.execFileSync('tar',['-xzf',archive,'-C',extracted],{timeout:120_000,stdio:'ignore'});
 const binary=join(extracted,`uv-${triple}`,'uv');
 await chmod(binary,0o700);
 const installed=io.spawnSync(binary,['python','install',PYTHON_VERSION,'--install-dir',pythonRoot],{encoding:'utf8',timeout:180_000,stdio:'pipe',env});
 const located=installed.status===0 ? io.spawnSync(binary,['python','find',PYTHON_VERSION],{encoding:'utf8',timeout:20_000,stdio:'pipe',env}) : installed;
 const python=located.status===0 ? located.stdout.trim() : '';
 const verified=python.length>0 && resolve(python).startsWith(`${resolve(pythonRoot)}/`)
  && io.spawnSync(python,['--version'],{encoding:'utf8',timeout:10_000,stdio:'pipe',env}).status===0;
 return verified ? {scratch,pythonRoot,python} : stop('Pinned Python 3.12.16 could not be installed and verified.');
 } catch(error) {
  await rm(scratch,{recursive:true,force:true});
  throw error;
 }
};
const validTarget=(project,target)=>existsSync(project) && lstatSync(project).isDirectory() && !lstatSync(project).isSymbolicLink() && checkedAncestors(project,target);
const install=async(args,io)=>{
 const scratch=await mkdtemp(join(tmpdir(),'upf-install-'));
 return stageArchive(args,scratch,io).finally(()=>rm(scratch,{recursive:true,force:true}));
};
const stageArchive=async(args,scratch,io)=>{
 const project=resolve(args.project);
 const target=join(project,'.upf-tools/distributions',args.version);
 return !validTarget(project,target) ? stop('Choose an existing project directory with no linked installation paths.') : prepareArchive(args,scratch,project,io);
};
const prepareArchive=async(args,scratch,project,io)=>{
 const files=args.source ? {archive:resolve(args.source),checksums:resolve(args.checksums ?? join(dirname(args.source),'SHA256SUMS'))} : await download(args.version,scratch,io);
 const archive=await verify(files,args.version);
 const python=args.extractionPython ?? pythonExecutable(args.python,io);
 const extracted=extract(python,archive,scratch,args.version,io);
 const manifest=JSON.parse(await readFile(join(extracted,'distribution.json'),'utf8'));
 return manifest.format!=='upf-distribution/1' || manifest.version!==args.version ? stop('Distribution identity does not match the selected release.')
  : chooseInstallation({...args,extractionPython:python},extracted,project,io);
};
const chooseInstallation=async(args,extracted,project,io)=>{
 const [wizard,report]=await Promise.all([
  import(pathToFileURL(join(extracted,'packages/cli/scripts/installer-wizard.mjs')).href),
  import(pathToFileURL(join(extracted,'packages/cli/scripts/install-report.mjs')).href),
 ]);
 const selection=args.input!==undefined ? await explicitPlan(args,extracted,project) : await (io.wizard ?? wizard.interactiveInstallation)({
  project,version:args.version,python:args.python,detectedPython:args.extractionPython,privatePython:args.privateRuntime!==null,
 });
 if(!selection.ok) return reportFailure(selection,io);
 const acceptedProject=selection.value.project;
 if(!validTarget(acceptedProject,join(acceptedProject,'.upf-tools/distributions',args.version))) return stop('Choose an existing project directory with no linked installation paths.');
 const log=await beginRunLog(extracted,acceptedProject,args.version,io);
 const lock=await acquireProjectLock(acceptedProject,io);
 try {
  const python=args.privateRuntime===null ? selection.value.plan.python : await persistPrivatePython(acceptedProject,args.privateRuntime,io);
  const accepted={...selection.value,plan:{...selection.value.plan,python}};
  await (log===null ? Promise.resolve() : appendFile(log,`${JSON.stringify({type:'launcher',event:'lock-acquired',at:new Date(io.now()).toISOString()})}\n`,{mode:0o600}).catch(()=>undefined));
  await ignoreToolFolders(acceptedProject,io);
  return await activate(args,extracted,accepted,io,report.finishInstall,log,lock);
 } finally {
  await releaseProjectLock(lock);
 }
};
const reportFailure=(result,io)=>{
 io.writeStdout(`${JSON.stringify(result)}\n`);
 return stop(`${result.error.message} ${result.error.recovery}`);
};
const explicitPlan=async(args,root,project)=>{
 const {parseBootstrap}=await import(pathToFileURL(join(root,'packages/cli/dist/tooling-input.js')).href);
 const parsed=parseBootstrap(JSON.parse(await readFile(resolve(args.input),'utf8')));
 return parsed.ok ? {ok:true,value:{project,plan:parsed.value}} : parsed;
};
const persistPrivatePython=async(project,runtime,io)=>{
 const target=join(project,'.upf-tools','python');
 const relativePython=relative(runtime.pythonRoot,runtime.python);
 return relativePython.startsWith('..') ? stop('The private Python path escaped its temporary installation directory.')
  : existsSync(target) ? stop('An existing .upf-tools/python directory is preserved; move it before accepting a private Python installation.')
    : mkdir(join(project,'.upf-tools'),{recursive:true,mode:0o700}).then(()=>chmod(join(project,'.upf-tools'),0o700))
      .then(()=>cp(runtime.pythonRoot,target,{recursive:true,verbatimSymlinks:true,errorOnExist:true}))
      .then(()=>join(target,relativePython));
};
export const beginRunLog=async(root,project,version,io)=>{
 const {writeInstallLog}=await import(pathToFileURL(join(root,'packages/cli/dist/install-log.js')).href);
 const path=await (io.writeInstallLog ?? writeInstallLog)(project,[{type:'launcher',event:'accepted',version,at:new Date(io.now()).toISOString()}]);
 return path;
};
export const acquireProjectLock=async(project,io)=>{
 const parent=join(project,'.upf-tools');
 const path=join(parent,'installer.lock');
 await mkdir(parent,{recursive:true,mode:0o700});
 await chmod(parent,0o700);
 const id=randomUUID();
 const ownerPath=path;
 const owner={id,pid:process.pid,startedAt:new Date(io.now()).toISOString(),childPid:null};
 const deadline=io.now()+120_000;
 const attempt=async()=>{
  const staging=join(parent,`.installer-lock-${id}`);
  return writeFile(staging,JSON.stringify(owner),{mode:0o600}).then(()=>link(staging,path))
   .then(()=>unlink(staging).catch(()=>undefined).then(()=>({path,ownerPath,id})))
   .catch(error=>unlink(staging).catch(()=>undefined).then(()=>error.code==='EEXIST'
    ? reclaimOrWait({path,deadline,io,attempt}) : Promise.reject(error)));
 };
 return attempt();
};
const LOCK_GRACE_MS=30_000;
const HELD=Symbol('held');
const lockGone=error=>error.code==='ENOENT'||error.code==='ENOTDIR';
const ignoreGone=error=>lockGone(error)?undefined:Promise.reject(error);
const readJson=file=>readFile(file,'utf8').then(JSON.parse);
const ownerLive=(io,owner)=>io.processAlive(owner.pid) || owner.childPid!==null && io.processAlive(owner.childPid);
const sameLock=(seen,current)=>seen.dev===current.dev && seen.ino===current.ino;
const discardStaleLock=path=>{const stale=`${path}.stale-${randomUUID()}`;return rename(path,stale).then(()=>rm(stale,{recursive:true,force:true}));};
// Current locks are a file holding the owner; legacy installers used a directory holding owner.json.
const ownerFile=(path,info)=>info.isDirectory()?join(path,'owner.json'):path;
// null: no readable owner yet (missing, still being written, or left truncated); HELD: present but unreadable to us.
const readOwner=file=>readFile(file,'utf8').then(text=>Promise.resolve(text).then(JSON.parse)
 .then(owner=>typeof owner?.pid==='number'?owner:null,()=>null),error=>lockGone(error)?null:HELD);
const lastTouched=(file,info)=>stat(file).then(record=>Math.max(record.mtimeMs,info.mtimeMs),()=>info.mtimeMs);
const graceOver=(file,info,io)=>lastTouched(file,info).then(touched=>io.now()-touched>LOCK_GRACE_MS);
// Abandoned: the owner is dead, or no readable owner has appeared within the grace period.
const abandoned=(path,info,io)=>{
 const file=ownerFile(path,info);
 return readOwner(file).then(owner=>owner===HELD ? false : owner===null ? graceOver(file,info,io) : !ownerLive(io,owner));
};
const reclaimOrWait=ctx=>stat(ctx.path).then(info=>abandoned(ctx.path,info,ctx.io).then(stale=>stale?reclaim(ctx,info):waitOrStop(ctx)),
 error=>lockGone(error)?ctx.attempt():Promise.reject(error));
const waitOrStop=ctx=>ctx.io.now()>=ctx.deadline ? stop('Another installer holds the project lock; wait and rerun.')
 : ctx.io.sleep(500).then(()=>reclaimOrWait(ctx));
// Only the claim holder discards, and only after re-checking that the lock it saw is still there and still abandoned.
const reclaim=(ctx,info)=>claimLock(`${ctx.path}.reclaim-${info.dev}-${info.ino}`,ctx.io).then(chain=>chain===null ? waitOrStop(ctx)
 : stat(ctx.path).then(current=>sameLock(info,current) && abandoned(ctx.path,current,ctx.io))
  .then(stale=>stale?discardStaleLock(ctx.path):undefined).catch(ignoreGone)
  .finally(()=>releaseClaim(chain)).then(()=>ctx.attempt()));
// Claims form a chain that is never shortened while contended: a dead claimant's successor hard-links
// `<claim>.after-<its token>`, so exactly one link can be the live end. Claims are staged, so none is read half-written.
// Returns the chain ending in our claim, or null while a live claimant (or an unreadable link) holds it.
const claimLock=(claimPath,io)=>{
 const token=randomUUID();
 const staging=`${claimPath}.${token}`;
 const take=chain=>link(staging,chain.at(-1)).then(()=>chain,error=>error.code==='EEXIST'?follow(chain):Promise.reject(error));
 const follow=chain=>readJson(chain.at(-1)).then(holder=>io.processAlive(holder.pid)?null:take([...chain,`${claimPath}.after-${holder.token}`]),
  error=>lockGone(error)?null:Promise.reject(error));
 return writeFile(staging,JSON.stringify({pid:process.pid,token}),{mode:0o600}).then(()=>take([claimPath]))
  .finally(()=>unlink(staging).catch(ignoreGone));
};
// The holder removes the whole chain once its re-check and discard are done.
const releaseClaim=chain=>Promise.all(chain.map(file=>unlink(file).catch(ignoreGone)));
export const releaseProjectLock=({path,ownerPath,id})=>readFile(ownerPath,'utf8').then(JSON.parse)
 .then(owner=>owner.id!==id?undefined:stat(path).then(info=>info.isDirectory()?rm(path,{recursive:true,force:true}):unlink(path)))
 .catch(()=>undefined);
const updateLockOwner=async(lock,update)=>{
 const temporary=`${lock.ownerPath}.${randomUUID()}`;
 return readFile(lock.ownerPath,'utf8').then(JSON.parse).then(owner=>writeFile(temporary,JSON.stringify(update(owner)),{mode:0o600}))
  .then(()=>rename(temporary,lock.ownerPath)).catch(()=>unlink(temporary).catch(()=>undefined));
};
export const reportLogPath=(report,fallback)=>report?.value?.log ?? report?.log ?? fallback;
const ignoreToolFolders=async(project,io)=>{
 const resolved=io.spawnSync('git',['rev-parse','--git-path','info/exclude'],{cwd:project,encoding:'utf8',stdio:'pipe',timeout:10_000});
 return resolved.status!==0 || resolved.stdout.trim()==='' ? undefined : appendExcludes(resolve(project,resolved.stdout.trim()));
};
const appendExcludes=async(path)=>{
 const existing=await readFile(path,'utf8').catch(()=>null);
 const rules=existing===null ? [] : ['/\.upf-tools/','/.project-knowledge/'].filter(rule=>!existing.split(/\r?\n/).includes(rule));
 const stat=lstatSync(path,{throwIfNoEntry:false});
 return stat===undefined || stat.isSymbolicLink() || !stat.isFile() || rules.length===0 ? undefined
  : appendFile(path,`${existing.endsWith('\n')?'':'\n'}${rules.join('\n')}\n`);
};
const activate=async(args,extracted,selection,io,finishInstall,log,lock)=>{
 const {project,plan}=selection;
 const target=join(project,'.upf-tools/distributions',args.version);
 return !validTarget(project,target) ? stop('Choose an existing project directory with no linked installation paths.') : activateSafe(args,extracted,project,target,plan,io,finishInstall,log,lock);
};
const activateSafe=async(args,extracted,project,target,plan,io,finishInstall,log,lock)=>{
 await mkdir(dirname(target),{recursive:true});
 const staging=await mkdtemp(join(dirname(target),'.install-'));
 return cp(extracted,join(staging,'distribution'),{recursive:true,verbatimSymlinks:true})
  .then(()=>publish(join(staging,'distribution'),target)).then(root=>savePlanAndBootstrap(root,project,plan,args,io,finishInstall,log,lock))
  .finally(()=>rm(staging,{recursive:true,force:true}));
};
const savePlanAndBootstrap=async(root,project,plan,args,io,finishInstall,log,lock)=>{
 const {directory,writeText,readText}=await import(pathToFileURL(join(root,'packages/cli/dist/tooling-files.js')).href);
 const {planFile}=await import(pathToFileURL(join(root,'packages/cli/dist/tooling-input.js')).href);
 const input=join(project,'.upf-tools/setup-plan.json');
 const previous=await readText(input);
 const created=previous.ok ? await directory(project,join(project,'.upf-tools')) : previous;
 const saved=created.ok ? await writeText(project,input,JSON.stringify(planFile(plan),null,2),previous.value,plan.python) : created;
 return !saved.ok ? stop(saved.error.message) : bootstrap(root,project,input,args,io,finishInstall,log,lock);
};
const bootstrap=async(root,project,input,args,io,finishInstall,log,lock)=>{
 const commandArgs=[join(root,'packages/cli/dist/index.js'),'project','bootstrap','--project',project,'--input',input,'--apply',...(log===null?[]:['--log',log])];
 const result=await runChild(process.execPath,commandArgs,project,io,lock);
 return [0,1,2].includes(result.status) ? bootstrapReport(result.stdout,root,project,result.status,args,io,finishInstall,log)
  : stop(`Setup stopped before returning a report.${log===null?'':' Log: '+log}`);
};
const runChild=(command,arguments_,cwd,io,lock)=>new Promise((resolveResult,rejectResult)=>{
 const child=io.spawn(command,arguments_,{cwd,stdio:['ignore','pipe','pipe'],detached:io.platform!=='win32',env:io.env});
 const owner=updateLockOwner(lock,value=>({...value,childPid:child.pid}));
 const chunks=[];let size=0;let settled=false;
 const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolveResult(result);};
 const timer=setTimeout(()=>{io.killGroup(child.pid,'SIGTERM');setTimeout(()=>io.killGroup(child.pid,'SIGKILL'),5000).unref();finish({status:1,stdout:''});},15*60_000);timer.unref();
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024){child.kill('SIGTERM');return finish({status:1,stdout:''});}chunks.push(chunk);});
 child.stderr.on('data',chunk=>io.writeStderr(chunk.toString()));
 child.once('error',error=>{clearTimeout(timer);rejectResult(error);});
 child.once('close',async(code,signal)=>{await owner;finish({status:code??1,signal,stdout:Buffer.concat(chunks).toString('utf8')});});
});
// Steps an agent completes after installation. A conflict in one of them, or any other unfinished step, means
// installation itself did not finish and must not read like the routine follow-ups every fresh install reports.
const FOLLOW_UPS=new Set(['knowledge-content','knowledge-server','review','tracker']);
const followUp=({step,failure})=>FOLLOW_UPS.has(step) && failure.code!=='host-configuration-conflict';
const listed=steps=>steps.map(({step,failure})=>`- ${step}: ${failure.message} ${failure.recovery}`).join('\n');
const bootstrapReport=(output,root,project,exitCode,args,io,finishInstall,log)=>{
 const report=decodeReport(output);
 if(report?.ok!==true) {
  const finished=finishInstall(output,{strict:args.strict});
  const savedLog=reportLogPath(report,log);
  io.writeStderr(`${finished.message}\n${savedLog===null?'Setup log could not be saved.':`Log: ${savedLog}`}\n`);
  return {ok:false,project,...(savedLog===null?{}:{log:savedLog}),result:report,exitCode:1};
 }
 return finishStructured(report,root,project,args,io,finishInstall,reportLogPath(report,log),exitCode);
};
const decodeReport=output=>{
 try { return JSON.parse(output); } catch { return null; }
};
const finishStructured=(report,root,project,args,io,finishInstall,log,exitCode)=>{
 const finished=finishInstall(JSON.stringify(report),{strict:args.strict});
 const open=(report.value.tooling.steps??[]).filter(({status})=>status!=='ready');
 const followUps=open.filter(followUp).map(({step})=>step);
 io.writeStderr(`${finished.message}\n${log===null?'Setup log could not be saved.':`Log: ${log}`}\n`);
 const result={ok:true,distribution:root,project,followUps,...(log===null?{}:{log}),status:report.value.status,result:report};
 return {...result,exitCode:exitCode===1 ? 1 : finished.exitCode};
};
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) process.exitCode=await main(process.argv.slice(2));

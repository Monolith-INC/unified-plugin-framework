#!/usr/bin/env node
// Standalone installation edge. It only places a verified distribution and invokes the shared bootstrap.
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, readlinkSync} from 'node:fs';
import {cp, mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo='Monolith-INC/unified-plugin-framework';
const usage='Interactive: node install.mjs [--project <project>] [--version <version>]\nAutomation: node install.mjs --input <accepted-plan.json> --project <project> [--version <version>]\nLocal archive: --source <archive> --checksums <SHA256SUMS>\nPython executable: --python <python3.12+>';
const stop=message=>{throw new Error(message);}; // Boundary: report installation failures once without partial activation.
const options=()=>parseArgs({options:{help:{type:'boolean'},version:{type:'string'},dest:{type:'string'},project:{type:'string'},input:{type:'string'},source:{type:'string'},checksums:{type:'string'},python:{type:'string'}},strict:true}).values;
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
const get=async(url,accept='application/octet-stream')=>{
 const response=await fetch(url,{signal:AbortSignal.timeout(60_000),headers:{Accept:accept}});
 return response.ok ? Buffer.from(await response.arrayBuffer()) : stop(`Could not download ${url} (HTTP ${response.status}); nothing installed.`);
};
const latest=()=>get('https://api.github.com/repos/'+repo+'/releases/latest','application/vnd.github+json').then(bytes=>JSON.parse(bytes.toString('utf8')).tag_name);
const download=async(version,scratch)=>{
 const base=`https://github.com/${repo}/releases/download/v${version}`;
 const archive=join(scratch,`unified-plugin-framework-${version}.tar.gz`);
 const checksums=join(scratch,'SHA256SUMS');
 await Promise.all([[archive,`${base}/unified-plugin-framework-${version}.tar.gz`],[checksums,`${base}/SHA256SUMS`]].map(async([path,url])=>writeFile(path,await get(url))));
 return {archive,checksums};
};
const verify=async(files,version)=>{
 const entries=(await readFile(files.checksums,'utf8')).trim().split(/\r?\n/).filter(line=>line.endsWith(`  unified-plugin-framework-${version}.tar.gz`));
 const expected=entries.length===1 ? entries[0].split('  ')[0] : '';
 return /^[a-f0-9]{64}$/.test(expected) && digest(await readFile(files.archive))===expected
  ? files.archive : stop('Archive checksum mismatch or missing unique checksum; nothing installed.');
};
const pythonExecutable=preferred=>{
 const candidates=preferred===undefined ? ['python3.12','python3','python3.13','python3.14'] : [preferred];
 const selected=candidates.find(program=>spawnSync(program,['-c','import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 1)'],{stdio:'ignore'}).status===0);
 return selected ?? stop('Python 3.12+ is required. Install it or pass --python <executable>.');
};
// Python's data extraction filter validates member paths and link targets before writes.
const extract=(python,archive,scratch,version)=>{
 const destination=join(scratch,'extract');
 execFileSync(python,['-c',`import pathlib,sys,tarfile
archive,destination,version=sys.argv[1:]
with tarfile.open(archive) as source:
 members=source.getmembers()
 expected='unified-plugin-framework-'+version
 assert all(pathlib.PurePosixPath(m.name).parts[0]==expected for m in members), 'unexpected archive root'
 tuple(tarfile.data_filter(member,destination) for member in members)
 base=(pathlib.Path(destination)/expected).resolve()
 assert all(not m.issym() or (pathlib.Path(destination)/m.name).parent.joinpath(m.linkname).resolve().is_relative_to(base) for m in members), 'link escapes distribution'
 source.extractall(destination,filter='data')
`,archive,destination,version],{stdio:'inherit'});
 return join(destination,`unified-plugin-framework-${version}`);
};
const publish=async(source,target)=>{
 return existsSync(target) ? JSON.stringify(inspectTree(source))===JSON.stringify(inspectTree(target)) ? target
  : stop('Existing distribution differs from this verified release; preserve it and choose a clean installation location.')
  : mkdir(dirname(target),{recursive:true}).then(()=>rename(source,target)).then(()=>target);
};
const main=async()=>{
 const args=options();
 return args.help ? process.stdout.write(`${usage}\n`)
  : Number(process.versions.node.split('.')[0])<22 ? stop('Node.js 22+ is required.')
  : args.input===undefined && (!process.stdin.isTTY || !process.stdout.isTTY) ? stop('Interactive installation needs a terminal. Run the one-command installer in a terminal or supply --input for automation.')
    : prepare(args);
};
const prepare=async args=>{
 const version=String(args.version ?? process.env.UPF_VERSION ?? await latest()).replace(/^v/,'');
 return !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version) || args.project!==undefined && args.dest!==undefined
  ? stop(usage) : install({...args,version,project:args.project ?? args.dest ?? process.cwd()});
};
const validTarget=(project,target)=>existsSync(project) && lstatSync(project).isDirectory() && !lstatSync(project).isSymbolicLink() && checkedAncestors(project,target);
const install=async args=>{
 const scratch=await mkdtemp(join(tmpdir(),'upf-install-'));
 return stageArchive(args,scratch).finally(()=>rm(scratch,{recursive:true,force:true}));
};
const stageArchive=async(args,scratch)=>{
 const project=resolve(args.project);
 const target=join(project,'.upf-tools/distributions',args.version);
 return !validTarget(project,target) ? stop('Choose an existing project directory with no linked installation paths.') : prepareArchive(args,scratch,project,target);
};
const prepareArchive=async(args,scratch,project,target)=>{
 const files=args.source ? {archive:resolve(args.source),checksums:resolve(args.checksums ?? join(dirname(args.source),'SHA256SUMS'))} : await download(args.version,scratch);
 const archive=await verify(files,args.version);
 const python=pythonExecutable(args.python);
 const extracted=extract(python,archive,scratch,args.version);
 const manifest=JSON.parse(await readFile(join(extracted,'distribution.json'),'utf8'));
 return manifest.format!=='upf-distribution/1' || manifest.version!==args.version ? stop('Distribution identity does not match the selected release.')
  : chooseInstallation({...args,extractionPython:python},extracted,project,target);
};
const chooseInstallation=async(args,extracted,project,target)=>{
 const wizard=await import(pathToFileURL(join(extracted,'packages/cli/scripts/installer-wizard.mjs')).href);
 const selection=args.input!==undefined ? await explicitPlan(args,extracted,project) : await wizard.interactiveInstallation({project,version:args.version,python:args.python,detectedPython:args.extractionPython});
 return !selection.ok ? reportFailure(selection) : activate(args,extracted,selection.value);
};
const reportFailure=result=>{
 process.stdout.write(`${JSON.stringify(result)}\n`);
 return stop(`${result.error.message} ${result.error.recovery}`);
};
const explicitPlan=async(args,root,project)=>{
 const {parseBootstrap}=await import(pathToFileURL(join(root,'packages/cli/dist/tooling-input.js')).href);
 const parsed=parseBootstrap(JSON.parse(await readFile(resolve(args.input),'utf8')));
 return parsed.ok ? {ok:true,value:{project,plan:parsed.value}} : parsed;
};
const activate=async(args,extracted,selection)=>{
 const {project,plan}=selection;
 const target=join(project,'.upf-tools/distributions',args.version);
 return !validTarget(project,target) ? stop('Choose an existing project directory with no linked installation paths.') : activateSafe(args,extracted,project,target,plan);
};
const activateSafe=async(args,extracted,project,target,plan)=>{
 await mkdir(dirname(target),{recursive:true});
 const staging=await mkdtemp(join(dirname(target),'.install-'));
 return cp(extracted,join(staging,'distribution'),{recursive:true,verbatimSymlinks:true})
  .then(()=>publish(join(staging,'distribution'),target)).then(root=>savePlanAndBootstrap(root,project,plan))
  .finally(()=>rm(staging,{recursive:true,force:true}));
};
const savePlanAndBootstrap=async(root,project,plan)=>{
 const {directory,writeText,readText}=await import(pathToFileURL(join(root,'packages/cli/dist/tooling-files.js')).href);
 const {planFile}=await import(pathToFileURL(join(root,'packages/cli/dist/tooling-input.js')).href);
 const input=join(project,'.upf-tools/setup-plan.json');
 const previous=await readText(input);
 const created=previous.ok ? await directory(project,join(project,'.upf-tools')) : previous;
 const saved=created.ok ? await writeText(project,input,JSON.stringify(planFile(plan),null,2),previous.value,plan.python) : created;
 return !saved.ok ? stop(saved.error.message) : bootstrap(root,project,input);
};
const bootstrap=(root,project,input)=>{
 const result=spawnSync(process.execPath,[join(root,'packages/cli/dist/index.js'),'project','bootstrap','--project',project,'--input',input,'--apply'],{encoding:'utf8',maxBuffer:16*1024*1024});
 process.stdout.write(result.stdout ?? '');
 process.stderr.write(result.stderr ?? '');
 return result.status===0 || result.status===2 ? bootstrapReport(result.stdout,root,project,result.status)
  : stop('Setup failed; resolve the reported recovery and rerun this accepted plan.');
};
// Steps an agent completes after installation. A conflict in one of them, or any other unfinished step, means
// installation itself did not finish and must not read like the routine follow-ups every fresh install reports.
const FOLLOW_UPS=new Set(['knowledge-content','knowledge-server','review','tracker']);
const followUp=({step,failure})=>FOLLOW_UPS.has(step) && failure.code!=='host-configuration-conflict';
const listed=steps=>steps.map(({step,failure})=>`- ${step}: ${failure.message} ${failure.recovery}`).join('\n');
const bootstrapReport=(output,root,project,exitCode)=>{
 const report=JSON.parse(output);
 const open=report.ok ? report.value.tooling.steps.filter(({status})=>status!=='ready') : [];
 const failed=open.filter(step=>!followUp(step));
 return !report.ok ? stop('Setup failed; resolve the reported recovery and rerun this accepted plan.')
  : failed.length>0 ? stop(`\nSetup did not finish. The workflows will not work until these steps succeed:\n${listed(failed)}\nRerun the installer; completed steps are reused.`)
  : announced(open,{ok:true,distribution:root,project,followUps:open.map(({step})=>step)},exitCode);
};
// Boundary: the follow-ups are for the person running the installer; stdout stays the machine-readable result.
const announced=(open,result,exitCode)=>{
 if(open.length>0) process.stderr.write(`\nInstallation finished. Ask your agent to complete these follow-ups:\n${listed(open)}\n`);
 process.exitCode=exitCode;
 return result;
};
await main().then(result=>result===undefined || typeof result==='boolean' ? undefined : process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error=>{
 process.stderr.write(`${error.message}\n`);process.exitCode=1;
});

#!/usr/bin/env node
// Standalone installation edge. It only places a verified distribution and invokes the shared bootstrap.
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, readlinkSync} from 'node:fs';
import {mkdir, mkdtemp, readFile, rename, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const repo='Monolith-INC/unified-plugin-framework';
const usage='node install.mjs --version <version> --project <project> --input <accepted-plan.json> [--source <archive> --checksums <SHA256SUMS>]';
const stop=message=>{throw new Error(message);}; // Boundary: report installation failures once without partial activation.
const options=()=>parseArgs({options:{version:{type:'string'},project:{type:'string'},input:{type:'string'},source:{type:'string'},checksums:{type:'string'},python:{type:'string',default:'python3.12'}},strict:true}).values;
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
const download=(version,scratch)=>{
 execFileSync('gh',['release','download',`v${version}`,'--repo',repo,'--pattern',`unified-plugin-framework-${version}.tar.gz`,'--pattern','SHA256SUMS','--dir',scratch],{stdio:'inherit'});
 return {archive:join(scratch,`unified-plugin-framework-${version}.tar.gz`),checksums:join(scratch,'SHA256SUMS')};
};
const verify=async(files,version)=>{
 const entries=(await readFile(files.checksums,'utf8')).trim().split(/\r?\n/).filter(line=>line.endsWith(`  unified-plugin-framework-${version}.tar.gz`));
 const expected=entries.length===1 ? entries[0].split('  ')[0] : '';
 return /^[a-f0-9]{64}$/.test(expected) && digest(await readFile(files.archive))===expected
  ? files.archive : stop('Archive checksum mismatch or missing unique checksum; nothing installed.');
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
 return !args.version || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(args.version) || !args.project || !args.input
  ? stop(usage) : install(args);
};
const install=async(args)=>{
 const project=resolve(args.project);const input=resolve(args.input);
 const target=join(project,'.upf-tools/distributions',args.version);
 JSON.parse(await readFile(input,'utf8'));
 return !existsSync(project) || !lstatSync(project).isDirectory() || lstatSync(project).isSymbolicLink() || !checkedAncestors(project,target)
  ? stop('Choose an existing project directory with no linked installation paths.') : installAccepted(args,project,input,target);
};
const installAccepted=async(args,project,input,target)=>{
 const scratch=await mkdtemp(join(tmpdir(),'upf-install-'));
 return stageArchive(args,project,input,target,scratch).finally(()=>rm(scratch,{recursive:true,force:true}));
};
const stageArchive=async(args,project,input,target,scratch)=>{
 const files=args.source ? {archive:resolve(args.source),checksums:resolve(args.checksums ?? join(dirname(args.source),'SHA256SUMS'))} : download(args.version,scratch);
 const archive=await verify(files,args.version);
 await mkdir(dirname(target),{recursive:true});
 const staging=await mkdtemp(join(dirname(target),'.install-'));
 return activateArchive(args,project,input,target,archive,staging).finally(()=>rm(staging,{recursive:true,force:true}));
};
const activateArchive=async(args,project,input,target,archive,staging)=>{
 const extracted=extract(args.python,archive,staging,args.version);
 const manifest=JSON.parse(await readFile(join(extracted,'distribution.json'),'utf8'));
 return manifest.format!=='upf-distribution/1' || manifest.version!==args.version ? stop('Distribution identity does not match the selected release.')
  : bootstrap(await publish(extracted,target),project,input);
};
const bootstrap=(root,project,input)=>{
 const result=spawnSync(process.execPath,[join(root,'packages/cli/dist/index.js'),'project','bootstrap','--project',project,'--input',input,'--apply'],{encoding:'utf8',maxBuffer:16*1024*1024});
 process.stdout.write(result.stdout ?? '');
 process.stderr.write(result.stderr ?? '');
 return result.status!==0 ? stop('Setup failed; resolve the reported recovery and rerun this accepted plan.') : bootstrapReport(result.stdout,root,project);
};
const bootstrapReport=(output,root,project)=>{
 const report=JSON.parse(output);
 return report.ok && report.value.tooling.status==='ready' ? {ok:true,distribution:root,project}
  : stop('Distribution installed; setup needs the actions reported above. Rerun the accepted plan after resolving them.');
};
await main().then(result=>process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error=>{
 process.stderr.write(`${error.message}\n`);process.exitCode=1;
});

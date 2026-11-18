// Release build boundary: pnpm deploy supplies the existing CLI and its production dependency closure.
import {cp, mkdir, mkdtemp, readFile, writeFile, unlink, symlink, rm} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {sha256} from '@agent-plugins/compiler';
import {ok, fail} from '@agent-plugins/project';
import {WORKFLOWS} from '@agent-plugins/workflows';
import {sourcesFor, verifySource} from '../dist/dependency-sources.js';
import {fetchSources, GIT_FETCHER} from '../dist/dependency-fetch.js';
import {NODE_PLUGIN_FACTS_IO} from '../dist/plugin-reader.js';
import {distributionFiles} from '../dist/distribution.js';
import {command, sequence} from '../dist/tooling-process.js';

const repository=resolve(import.meta.dirname,'../../..');
const version=process.env.UPF_RELEASE_VERSION ?? '0.0.0-dev';
const output=resolve(process.argv[2] ?? join(repository,'release-assets'));
const workflows=Object.keys(WORKFLOWS);
const framework=join(repository,'plugins/unified-plugin-framework');
const build=async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'upf-release-distribution-'));
 const root=join(scratch,`unified-plugin-framework-${version}`);
 const sources=sourcesFor(NODE_PLUGIN_FACTS_IO,framework,workflows,[]);
 const fetched=sources.ok ? await fetchSources({project:scratch,cache:join(scratch,'fetched'),verify:verifySource(NODE_PLUGIN_FACTS_IO,framework,workflows),fetcher:GIT_FETCHER},sources.value) : sources;
 return (fetched.ok ? deploy(root,scratch,sources.value) : Promise.resolve(fetched)).finally(()=>rm(scratch,{recursive:true,force:true}));
};
const deploy=async(root,scratch,sources)=>{
 const deployed=await command('pnpm',['--filter','@agent-plugins/cli','--prod','deploy','--legacy','--frozen-lockfile',join(root,'packages/cli')],repository,300_000);
 return deployed.ok ? localizeSelfLink(root).then(()=>copyContents(root,scratch,sources)) : deployed;
};
// pnpm legacy deploy leaves its workspace self-reference pointing at the build checkout.
// Replace only that generated link; all production imports still use pnpm's authoritative deployment.
const localizeSelfLink=async(root)=>{
 const cli=join(root,'packages/cli');
 const link=join(cli,'node_modules/.pnpm/node_modules/@agent-plugins/cli');
 await unlink(link);
 await symlink(relative(dirname(link),cli),link,'dir');
};
const copyContents=async(root,scratch,sources)=>{
 await Promise.all(['plugins','runtimes/project-knowledge','README.md','CHANGELOG.md','LICENSE','NOTICE','scripts/install-release.mjs','scripts/install.sh','packages/cli/scripts/installer-wizard.mjs','packages/cli/scripts/install-report.mjs','docs/workflows/tooling-bootstrap.md','docs/vendor-payload-installation.md'].map(path=>
  cp(join(repository,path),join(root,path),{recursive:true,filter:path=>!['node_modules','.venv','__pycache__','build','dist'].some(part=>path.split(/[\\/]/).includes(part))})));
 const copied=await sequence(sources,source=>cp(join(scratch,'fetched',`${source.plugin}@${source.version}`),join(root,'dependencies',`${source.plugin}@${source.version}`),{recursive:true,verbatimSymlinks:true})
  .then(()=>ok(source.plugin)),'Dependencies included.');
 return copied.ok ? pack(root,sources) : copied;
};
const pack=async(root,sources)=>{
 const plugins=sources.map(({plugin,version})=>({plugin,version,files:distributionFiles(join(root,'dependencies',`${plugin}@${version}`))}));
 return plugins.some(({files})=>files.some(({sha256})=>sha256==='unsupported-link'))
  ? fail('distribution-link','A plugin source contains an unsupported link.','Resolve the release source packaging before publication.') : publishArchive(root,plugins);
};
const publishArchive=async(root,plugins)=>{
 await writeFile(join(root,'.upf-distribution'),'upf-distribution/1\n');
 await writeFile(join(root,'distribution.json'),JSON.stringify({format:'upf-distribution/1',version,plugins},null,2));
 await mkdir(output,{recursive:true});
 const name=`unified-plugin-framework-${version}.tar.gz`;
 const audited=distributionFiles(root);
 return audited.some(file=>file.sha256==='unsupported-link') ? fail('distribution-link','A deployed link escapes the distribution.','Correct production deployment before publication.') : archive(root,name);
};
const archive=async(root,name)=>{
 const archived=await command('tar',['-czf',join(output,name),'-C',resolve(root,'..'),root.split(/[\\/]/).at(-1)],repository,300_000);
 return archived.ok ? finish(name) : archived;
};
const finish=async(name)=>{
 await Promise.all([['scripts/install-release.mjs','install.mjs'],['scripts/install.sh','install.sh']].map(([source,name])=>cp(join(repository,source),join(output,name))));
 const entries=await Promise.all([name,'install.mjs','install.sh'].map(async name=>`${sha256(await readFile(join(output,name)))}  ${name}`));
 const checksums=await readFile(join(output,'SHA256SUMS'),'utf8').catch(()=> '');
 const retained=checksums.split(/\r?\n/).filter(line=>line.length>0 && ![name,'install.mjs','install.sh'].some(asset=>line.endsWith(`  ${asset}`)));
 await writeFile(join(output,'SHA256SUMS'),`${[...retained,...entries].join('\n')}\n`);
 return ok({archive:join(output,name),plugins:5});
};
const result=/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)
 ? await build().catch(error=>fail('distribution-build',String(error),'Correct the build failure before publishing.'))
 : fail('distribution-version','Invalid UPF_RELEASE_VERSION.','Use a semantic release version without the v prefix.');
process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
process.exitCode=result.ok ? 0 : 1;

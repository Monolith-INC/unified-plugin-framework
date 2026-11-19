import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {claudeMarketplaceName} from '@agent-plugins/adapter-claude/tooling';
import {HOST_NAMES} from '../dist/host-names.js';
import {HOSTS} from '../dist/host-table.js';
import {parseBootstrap} from '../dist/tooling-input.js';

const plan={python:'python3.12',workflows:['continuity'],pluginRoots:[],knowledge:{knowledgeRoot:'knowledge',documentMode:'shared',docsRoot:'docs',vaultRoot:'docs'}};
const context=async(extra={})=>{
  const root=await mkdtemp(join(tmpdir(),'upf-hosts-'));
  const project=join(root,'project');
  await mkdir(join(project,'.upf-tools'),{recursive:true});
  return {project,canonical:project,claudeState:join(root,'claude.json'),tools:join(project,'.upf-tools'),python:'python3.12',...extra};
};

test('every setup host can be selected and is described before installation',()=>{
  assert.deepEqual([...HOST_NAMES],['codex','claude']);
  HOST_NAMES.map(host=>assert.equal(parseBootstrap({...plan,host}).ok,true,host));
  assert.equal(parseBootstrap({...plan,host:'cursor'}).ok,false);
  HOST_NAMES.map(host=>assert.match(HOSTS[host].changes,/\S/));
  assert.equal(new Set(HOST_NAMES.map(host=>HOSTS[host].bareSkills)).size,HOST_NAMES.length,'each host reads bare skills from its own folder');
});

test('Claude Code catalog is named for this project, keeps earlier entries and refuses a moved source',{ skip: process.platform === 'win32' }, async()=>{
  const ctx=await context();
  const name=claudeMarketplaceName(ctx.canonical);
  const plugins=[{name:'unified-plugin-framework',root:join(ctx.tools,'hosts/claude/unified-plugin-framework'),kind:'framework'},{name:'superpowers',root:join(ctx.tools,'plugins/superpowers'),kind:'dependency'}];
  assert.equal((await HOSTS.claude.catalog(ctx,plugins)).ok,true);
  const path=join(ctx.tools,'.claude-plugin/marketplace.json');
  const catalog=JSON.parse(await readFile(path,'utf8'));
  assert.equal(catalog.name,name);
  assert.deepEqual(catalog.plugins,[{name:'unified-plugin-framework',source:'./hosts/claude/unified-plugin-framework'},{name:'superpowers',source:'./plugins/superpowers'}]);
  assert.equal((await HOSTS.claude.catalog(ctx,plugins.slice(1))).ok,true);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),catalog,'earlier entries are kept');
  const moved=await HOSTS.claude.catalog(ctx,[{name:'superpowers',root:join(ctx.tools,'elsewhere'),kind:'dependency'}]);
  assert.equal(moved.ok,false);
  assert.match(moved.error.message,/another folder/);
});

const localServer=(ctx,server)=>writeFile(ctx.claudeState,JSON.stringify({projects:{[ctx.canonical]:{mcpServers:{'project-knowledge':server}}}}));
const declare=async(ctx,path)=>{
  await mkdir(join(ctx.project,'.claude'),{recursive:true});
  await writeFile(join(ctx.project,'.claude/settings.local.json'),JSON.stringify({extraKnownMarketplaces:{[claudeMarketplaceName(ctx.canonical)]:{source:{source:'directory',path}}}}));
};

test('Claude Code registration needs this project\'s local marketplace and its local-scope knowledge server',async()=>{
  const ctx=await context({knowledgeCommand:join('/repo','.project-knowledge/runtime/bin/upf-project-knowledge')});
  const entry={type:'stdio',command:ctx.knowledgeCommand,args:['--project',ctx.project]};
  assert.equal((await HOSTS.claude.registered(ctx)).value,false);
  await declare(ctx,ctx.tools);
  assert.equal((await HOSTS.claude.registered(ctx)).value,false,'the knowledge server is still missing');
  await localServer(ctx,entry);
  assert.equal((await HOSTS.claude.registered(ctx)).value,true);
  assert.equal((await HOSTS.claude.register(ctx)).ok,true,'a declared marketplace and an equal server need no host command');
  await declare(ctx,'/elsewhere');
  assert.equal((await HOSTS.claude.registered(ctx)).ok,false,'this project\'s marketplace declared for another folder is a conflict');
  await writeFile(join(ctx.project,'.claude/settings.local.json'),JSON.stringify({extraKnownMarketplaces:{'upf-other':{source:{source:'directory',path:'/elsewhere'}},[claudeMarketplaceName(ctx.canonical)]:{source:{source:'directory',path:ctx.tools}}}}));
  assert.equal((await HOSTS.claude.registered(ctx)).value,true,'another project\'s marketplace is not this one');
  assert.equal(await readFile(join(ctx.project,'.mcp.json'),'utf8').catch(()=>null),null,'no shared project file is written');
});

test('Claude Code preserves a knowledge server the user configured with another command',async()=>{
  const ctx=await context({knowledgeCommand:join('/repo','.project-knowledge/runtime/bin/upf-project-knowledge')});
  await declare(ctx,ctx.tools);
  await localServer(ctx,{command:'other'});
  const kept=await HOSTS.claude.register(ctx);
  assert.equal(kept.ok,false);
  assert.match(kept.error.message,/another command/);
  assert.deepEqual(JSON.parse(await readFile(ctx.claudeState,'utf8')).projects[ctx.canonical].mcpServers['project-knowledge'],{command:'other'});
});

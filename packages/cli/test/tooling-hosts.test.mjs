import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {HOST_NAMES,HOSTS} from '../dist/tooling-hosts.js';
import {parseBootstrap} from '../dist/tooling-input.js';

const plan={python:'python3.12',workflows:[],pluginRoots:[],knowledge:{knowledgeRoot:'knowledge',documentMode:'shared',docsRoot:'docs',vaultRoot:'docs'}};
const context=async(extra={})=>{
  const root=await mkdtemp(join(tmpdir(),'upf-hosts-'));
  const project=join(root,'project');const home=join(root,'home');
  await mkdir(join(project,'.upf-tools'),{recursive:true});await mkdir(home,{recursive:true});
  return {project,home,tools:join(project,'.upf-tools'),python:'python3.12',...extra};
};
const plugin=async(ctx,dir,name,manifest)=>{
  const root=join(ctx.tools,dir,name);
  await mkdir(join(root,'skills/probe'),{recursive:true});await mkdir(join(root,manifest.split('/')[0]),{recursive:true});
  await writeFile(join(root,manifest),JSON.stringify({name,version:'1.0.0',skills:'./skills/'}));
  await writeFile(join(root,'skills/probe/SKILL.md'),'---\nname: probe\ndescription: probe\n---\n');
  return {name,root};
};

test('every host with a payload adapter can be selected for complete setup',()=>{
  assert.deepEqual([...HOST_NAMES],['codex','claude','cursor']);
  HOST_NAMES.map(host=>assert.equal(parseBootstrap({...plan,host}).ok,true,host));
  HOST_NAMES.map(host=>assert.equal(HOSTS[host].vendor,host));
  assert.equal(new Set(HOST_NAMES.map(host=>HOSTS[host].bareSkills)).size,HOST_NAMES.length,'each host reads bare skills from its own folder');
});

test('Cursor registers the knowledge server once and preserves a different entry',async()=>{
  const ctx=await context({knowledgeCommand:'/runtime/bin/upf-project-knowledge'});
  assert.equal((await HOSTS.cursor.registered(ctx)).value,false);
  assert.equal((await HOSTS.cursor.register(ctx)).ok,true);
  const written=JSON.parse(await readFile(join(ctx.project,'.cursor/mcp.json'),'utf8'));
  assert.deepEqual(written.mcpServers['project-knowledge'],{command:'/runtime/bin/upf-project-knowledge',args:['--project',ctx.project]});
  assert.equal((await HOSTS.cursor.registered(ctx)).value,true);
  assert.equal((await HOSTS.cursor.register(ctx)).ok,true,'re-entry keeps the equal entry');
  const other={mcpServers:{'project-knowledge':{command:'other'},kept:{command:'x'}}};
  await writeFile(join(ctx.project,'.cursor/mcp.json'),JSON.stringify(other));
  assert.equal((await HOSTS.cursor.register(ctx)).ok,false);
  assert.deepEqual(JSON.parse(await readFile(join(ctx.project,'.cursor/mcp.json'),'utf8')),other,'a different entry is never overwritten');
});

test('Cursor links project plugins into its local plugin folder and discovers them',async()=>{
  const ctx=await context();
  const framework=await plugin(ctx,'hosts/cursor','unified-plugin-framework','.cursor-plugin/plugin.json');
  assert.equal((await HOSTS.cursor.activate(ctx,framework)).ok,true);
  assert.equal(await readlink(join(ctx.home,'.cursor/plugins/local/unified-plugin-framework')),framework.root);
  assert.equal((await HOSTS.cursor.activate(ctx,framework)).ok,true,'an owned link is reused');
  await mkdir(join(ctx.project,'.cursor/skills/bmad-brainstorming'),{recursive:true});
  await writeFile(join(ctx.project,'.cursor/skills/bmad-brainstorming/SKILL.md'),'---\nname: bmad-brainstorming\ndescription: b\n---\n');
  const found=await HOSTS.cursor.discover(ctx);
  assert.deepEqual(found.value.map(({name})=>name).sort(),['bmad-brainstorming','unified-plugin-framework:probe']);
  const foreign=await plugin(await context(),'hosts/cursor','superpowers','.cursor-plugin/plugin.json');
  await symlink(foreign.root,join(ctx.home,'.cursor/plugins/local/superpowers'));
  assert.equal((await HOSTS.cursor.activate(ctx,{name:'superpowers',root:join(ctx.tools,'plugins/superpowers')})).ok,false,'another project or user plugin is preserved');
  assert.equal((await HOSTS.cursor.discover(ctx)).value.some(({name})=>name.startsWith('superpowers:')),false,'plugins linked from elsewhere are not this project\'s');
});

test('Claude Code catalog lists each plugin once at its own folder and refuses a moved source',async()=>{
  const ctx=await context();
  const plugins=[{name:'unified-plugin-framework',root:join(ctx.tools,'hosts/claude/unified-plugin-framework')},{name:'superpowers',root:join(ctx.tools,'plugins/superpowers')}];
  assert.equal((await HOSTS.claude.catalog(ctx,plugins)).ok,true);
  const path=join(ctx.tools,'.claude-plugin/marketplace.json');
  const catalog=JSON.parse(await readFile(path,'utf8'));
  assert.equal(catalog.name,'upf-project');
  assert.deepEqual(catalog.plugins,[{name:'unified-plugin-framework',source:'./hosts/claude/unified-plugin-framework'},{name:'superpowers',source:'./plugins/superpowers'}]);
  assert.equal((await HOSTS.claude.catalog(ctx,plugins.slice(1))).ok,true);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),catalog,'earlier entries are kept');
  assert.equal((await HOSTS.claude.catalog(ctx,[{name:'superpowers',root:join(ctx.tools,'elsewhere')}])).ok,false);
});

test('Claude Code registration requires the project marketplace and knowledge server',async()=>{
  const ctx=await context({knowledgeCommand:'/runtime/bin/upf-project-knowledge'});
  assert.equal((await HOSTS.claude.registered(ctx)).value,false);
  await mkdir(join(ctx.project,'.claude'),{recursive:true});
  await writeFile(join(ctx.project,'.claude/settings.json'),JSON.stringify({extraKnownMarketplaces:{'upf-project':{source:{source:'directory',path:ctx.tools}}}}));
  assert.equal((await HOSTS.claude.registered(ctx)).value,false,'the knowledge server is still missing');
  assert.equal((await HOSTS.claude.register(ctx)).ok,true,'a declared marketplace needs no host command');
  assert.equal((await HOSTS.claude.registered(ctx)).value,true);
  await writeFile(join(ctx.project,'.claude/settings.json'),JSON.stringify({extraKnownMarketplaces:{'upf-project':{source:{source:'directory',path:'/elsewhere'}}}}));
  assert.equal((await HOSTS.claude.registered(ctx)).ok,false,'a marketplace declared for another folder is a conflict');
});

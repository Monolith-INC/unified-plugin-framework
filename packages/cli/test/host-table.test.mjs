import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {CLAUDE_SCHEMA_VERSION} from '@agent-plugins/adapter-claude';
import {CODEX_SCHEMA_VERSION} from '@agent-plugins/adapter-codex';
import {SUPPORTED_SCHEMA_VERSION} from '@agent-plugins/core';
import {HOST_NAMES} from '../dist/host-names.js';
import {HOST_SPECS_FILE, rewriteSkillFrontmatterName} from '../dist/host-specs.js';
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
  assert.equal(new Set(HOST_NAMES.map(host=>HOSTS[host].bareSkills)).size,HOST_NAMES.length,'each host reads skills from its own project folder');
});

test('spec-driven registration records pinned Agent Plugins and host schema versions without touching user home state',async()=>{
  const ctx=await context();
  assert.equal((await HOSTS.codex.registered(ctx)).value,false);
  assert.equal((await HOSTS.claude.registered(ctx)).value,false);
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  assert.equal((await HOSTS.codex.registered(ctx)).value,true);
  assert.equal((await HOSTS.claude.registered(ctx)).value,false);
  assert.equal((await HOSTS.claude.register(ctx)).ok,true);
  assert.equal((await HOSTS.claude.registered(ctx)).value,true);
  const receipt=JSON.parse(await readFile(join(ctx.project,HOST_SPECS_FILE),'utf8'));
  assert.equal(receipt.agentPluginsSpec,SUPPORTED_SCHEMA_VERSION);
  assert.equal(receipt.hosts.codex.vendorSchemaVersion,CODEX_SCHEMA_VERSION);
  assert.equal(receipt.hosts.codex.skillsDir,'.agents/skills');
  assert.equal(receipt.hosts.claude.vendorSchemaVersion,CLAUDE_SCHEMA_VERSION);
  assert.equal(receipt.hosts.claude.skillsDir,'.claude/skills');
  assert.equal(await readFile(ctx.claudeState,'utf8').catch(()=>null),null,'global user state is never written');
  assert.equal(await readFile(join(ctx.project,'.mcp.json'),'utf8').catch(()=>null),null,'no shared MCP file is written');
});

test('deterministic zero-CLI host discovery validates project-local skills and rejects malformed frontmatter',async()=>{
  const ctx=await context();
  await mkdir(join(ctx.project,'.agents/skills/good-skill'),{recursive:true});
  await mkdir(join(ctx.project,'.agents/skills/bad-skill'),{recursive:true});
  await writeFile(join(ctx.project,'.agents/skills/good-skill/SKILL.md'),'---\nname: good-skill\ndescription: Valid skill.\n---\n# Good\n');
  await writeFile(join(ctx.project,'.agents/skills/bad-skill/SKILL.md'),'# Missing frontmatter\n');
  const discovered=await HOSTS.codex.discover(ctx);
  assert.equal(discovered.ok,true);
  assert.deepEqual(discovered.value.map(({name,scope})=>({name,scope})),[{name:'good-skill',scope:'repo'}]);
  const rewritten=rewriteSkillFrontmatterName('---\nname: review-task\ndescription: Task review.\n---\n# Review\n','monolithic-code-review-toolkit-review-task');
  assert.match(rewritten,/^---\nname: monolithic-code-review-toolkit-review-task\ndescription: Task review\.\n---\n# Review\n/);
});

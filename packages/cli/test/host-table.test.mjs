import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,stat,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
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
  return {project,canonical:project,claudeState:join(root,'claude.json'),tools:join(project,'.upf-tools'),python:process.platform==='win32'?'python':'python3.12',...extra};
};

test('Codex registration does not change project configuration without explicit opt-in',async()=>{
  const ctx=await context();
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  assert.equal(await readFile(join(ctx.project,'.codex/config.toml'),'utf8').catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),null);
  assert.equal((await HOSTS.codex.registered(ctx)).value,true);
});

test('Codex opt-in respects a quoted feature choice without changing unrelated TOML',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  const original='["features"]\n"default_mode_request_user_input" = false\n';
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,original);
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  assert.equal(await readFile(file,'utf8'),original);
  assert.equal((await HOSTS.codex.registered(ctx)).value,true);
});

test('Codex opt-in adds a feature without confusing unrelated strings or keys',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  const original='note = "default_mode_request_user_input = false"\r\n[other]\r\ndefault_mode_request_user_input = false\r\n["features"] # user settings\r\nhooks = true\r\n';
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,original);
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  const changed=await readFile(file,'utf8');
  assert.equal(changed.replace('default_mode_request_user_input = true\r\n',''),original);
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  assert.equal(await readFile(file,'utf8'),changed);
});

test('Codex opt-in preserves the existing configuration file permissions',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,'model = "test"\n');
  await chmod(file,0o640);
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  if(process.platform!=='win32') assert.equal((await stat(file)).mode & 0o777,0o640);
});

test('Codex opt-in preserves invalid configuration and rejects linked paths',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,'[features\n');
  assert.equal((await HOSTS.codex.register(ctx)).error.code,'invalid-codex-config');
  assert.equal(await readFile(file,'utf8'),'[features\n');
  const linked=await context({codexQuestions:true});
  await symlink(join(ctx.project,'.codex'),join(linked.project,'.codex'));
  assert.equal((await HOSTS.codex.register(linked)).error.code,'invalid-codex-config');
  assert.equal(await readFile(file,'utf8'),'[features\n');
});

test('Codex opt-in preserves configuration containing invalid UTF-8',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  const original=Buffer.from([35,32,255,10]);
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,original);
  assert.equal((await HOSTS.codex.register(ctx)).ok,false);
  assert.deepEqual(await readFile(file),original);
});

test('Codex opt-in preserves an explicit false in an inline features table',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  const original='features = { default_mode_request_user_input = false, hooks = true }\n';
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,original);
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  assert.equal(await readFile(file,'utf8'),original);
});

test('Codex opt-in preserves multiline strings, dates, nonfinite numbers and dotted keys',async()=>{
  const samples=[
    'note = """\ndefault_mode_request_user_input = false\n"""\nwhen = 1979-05-27T07:32:00Z\nratio = inf\n[features]\nhooks = true\n',
    'features.hooks = true\n[other]\nvalue = "keep"\n',
  ];
  await Promise.all(samples.map(async original=>{
    const ctx=await context({codexQuestions:true});
    const file=join(ctx.project,'.codex/config.toml');
    await mkdir(join(ctx.project,'.codex'),{recursive:true});
    await writeFile(file,original);
    assert.equal((await HOSTS.codex.register(ctx)).ok,true);
    const result=await readFile(file,'utf8');
    assert.ok([result.replace('features.default_mode_request_user_input = true\n',''),result.replace('default_mode_request_user_input = true\n','')].includes(original));
  }));
});

test('Codex opt-in fails safely when an inline features table cannot be edited',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  const original='features = { hooks = true }\n';
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,original);
  assert.equal((await HOSTS.codex.register(ctx)).ok,false);
  assert.equal(await readFile(file,'utf8'),original);
});

test('Codex opt-in can extend a features table without a trailing newline',async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  await writeFile(file,'[features]');
  assert.equal((await HOSTS.codex.register(ctx)).ok,true);
  assert.equal(await readFile(file,'utf8'),'[features]\ndefault_mode_request_user_input = true\n');
});

test('Codex opt-in rejects a FIFO without waiting for a writer', {skip: process.platform === 'win32', timeout: 2000}, async()=>{
  const ctx=await context({codexQuestions:true});
  const file=join(ctx.project,'.codex/config.toml');
  await mkdir(join(ctx.project,'.codex'),{recursive:true});
  assert.equal(spawnSync('mkfifo',[file]).status,0);
  assert.equal((await HOSTS.codex.register(ctx)).error.code,'invalid-codex-config');
});

test('every setup host can be selected and is described before installation',()=>{
  assert.deepEqual([...HOST_NAMES],['codex','claude']);
  HOST_NAMES.map(host=>assert.equal(parseBootstrap({...plan,host}).ok,true,host));
  assert.equal(parseBootstrap({...plan,host:'cursor'}).ok,false);
  HOST_NAMES.map(host=>assert.match(HOSTS[host].changes,/\S/));
  assert.equal(new Set(HOST_NAMES.map(host=>HOSTS[host].bareSkills)).size,HOST_NAMES.length,'each host reads skills from its own project folder');
});

test('spec-driven registration records pinned Agent Plugins and host schema versions without touching user home state',async()=>{
  const ctx=await context({codexQuestions:true});
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
  assert.match(await readFile(join(ctx.project,'.codex/config.toml'),'utf8'),/default_mode_request_user_input = true/);
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

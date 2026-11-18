// The wizard collects choices; the existing bootstrap remains the only setup executor.
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {configure,fail,ok,object,resolveLinearScope} from '@agent-plugins/project';
import {WORKFLOWS} from '@agent-plugins/workflows';
import {parseBootstrap} from '../dist/tooling-input.js';
import {HOST_NAMES,HOSTS} from '../dist/tooling-hosts.js';

const readJson=path=>readFile(path,'utf8').then(JSON.parse).then(ok).catch(error=>error.code==='ENOENT' ? ok(null)
 : fail('unreadable-settings',`Could not read ${path}.`,'Preserve the existing file and correct it before rerunning the installer.'));
const value=(io,prompt,fallback,valid=()=>true)=>io.ask(`${prompt}${fallback===undefined ? '' : ` [${fallback}]`}: `).then(answer=>{
 const selected=answer.trim() || fallback;
 return valid(selected) ? selected : io.say('Please enter a valid value.').then(()=>value(io,prompt,fallback,valid));
});
const nonempty=value=>typeof value==='string' && value.trim().length>0;
const relativePath=value=>nonempty(value) && !value.startsWith('/') && !value.includes('\\') && !value.includes(':') && value.split('/').every(part=>part!=='' && part!=='.' && part!=='..');
const oneOf=choices=>selected=>choices.includes(selected);
const defaultWorkflows=Object.keys(WORKFLOWS).join(',');
const workflowNames=raw=>raw.split(',').map(name=>name.trim());
const validWorkflows=raw=>nonempty(raw) && workflowNames(raw).every(name=>Object.hasOwn(WORKFLOWS,name)) && new Set(workflowNames(raw)).size===workflowNames(raw).length;
const tracker=async(io,current,lookup)=>{
 const adapter=await value(io,'Tracker: local (project files) or linear',current?.adapter,oneOf(['local','linear']));
 return adapter===current?.adapter && configure(null,{language:'en',artifactsPath:'docs',tracker:current}).ok ? ok(current)
  : adapter==='local' ? ok({adapter:'local',values:{}}) : linearTracker(io,lookup,current?.adapter==='linear' ? current : undefined);
};
const linearTracker=async(io,lookup,current)=>{
 await io.say('Linear uses LINEAR_API_KEY from your environment. Do not enter a credential here.');
 const team=current?.values?.team ?? await value(io,'Linear team name or URL',undefined,nonempty);
 const project=current?.values?.project ?? await value(io,'Linear project name or URL',undefined,nonempty);
 const scope=await lookup({team,project},current);
 return scope.ok ? ok({...current,adapter:'linear',values:{...current?.values,...scope.value}}) : scope;
};
const knowledgeChoices=async(io,current)=>{
 const documentMode=current?.documentMode ?? await value(io,'Documents: shared (one copy) or separate (developer docs and vault)','shared',oneOf(['shared','separate']));
 const docsRoot=current?.docsRoot ?? await value(io,'Developer documents folder','docs',relativePath);
 const vaultRoot=current?.vaultRoot ?? (documentMode==='shared' ? docsRoot : await value(io,'Agent vault folder','docs/vault',relativePath));
 const knowledgeRoot=current?.knowledgeRoot ?? await value(io,'Project knowledge folder','.project-knowledge/knowledge',relativePath);
 return {documentMode,docsRoot,vaultRoot,knowledgeRoot};
};
const choose=async(io,project,settings,knowledge,options)=>{
 await io.say(`Supported hosts: ${HOST_NAMES.map(name=>`${name} (${HOSTS[name].label})`).join(', ')}. Existing project choices will be reused.`);
 const host=await value(io,`Agent host: ${HOST_NAMES.join(', ')}`,options.savedPlan?.host ?? 'codex',oneOf(HOST_NAMES));
 const workflows=workflowNames(await value(io,'Workflows (comma-separated)',options.savedPlan?.workflows?.join(',') ?? defaultWorkflows,validWorkflows));
 const python=await value(io,'Python 3.12+ executable',options.python ?? options.savedPlan?.python ?? options.detectedPython ?? 'python3.12',nonempty);
 const language=settings?.language ?? await value(io,'Language for communication and documents','en',raw=>typeof raw==='string' && /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(raw));
 const artifactsPath=settings?.artifactsPath ?? await value(io,'Planning documents folder','docs/work-items',relativePath);
 const selected=await tracker(io,settings?.tracker,options.lookup ?? ((names,current)=>resolveLinearScope(names,current)()));
 return !selected.ok ? selected : complete(io,project,settings,{host,python,workflows,pluginRoots:[],knowledge:await knowledgeChoices(io,knowledge),
  answers:{...(settings ?? {}),language,artifactsPath,tracker:selected.value}},options.version);
};
const complete=async(io,project,settings,plan,version)=>{
 const answers=configure(settings,plan.answers);
 const parsed=answers.ok ? parseBootstrap({...plan,answers:answers.value}) : answers;
 return !parsed.ok ? parsed : confirm(io,project,parsed.value,version);
};
const HOST_CHANGES=Object.freeze({
 codex:'Codex configuration (.codex/config.toml) and plugin registrations',
 claude:'Claude Code project settings (.claude/settings.json, .mcp.json, .claude/skills) and project-scoped plugin installs',
 cursor:'Cursor project settings (.cursor/mcp.json, .cursor/skills) and plugin links in ~/.cursor/plugins/local',
});
const confirm=async(io,project,plan,version)=>{
 await io.say(`\nInstall UPF ${version} into ${project}\nHost: ${HOSTS[plan.host].label}\nWorkflows: ${plan.workflows.join(', ')}\nTracker: ${plan.answers.tracker.adapter}\nLanguage: ${plan.answers.language}\nDocuments: ${plan.knowledge.docsRoot}\nVault: ${plan.knowledge.vaultRoot}\nKnowledge: ${plan.knowledge.knowledgeRoot}\n\nChanges: .upf-tools/ (bundled CLI/plugins), project settings, .project-knowledge/ runtime, ${HOST_CHANGES[plan.host]}. Existing valid choices are reused. Python runtime packages may be downloaded. No plugin repositories are downloaded.\nKnowledge content, provider bindings or authentication may still need follow-up; the report will name each action.`);
 const accepted=await value(io,'Apply this setup? yes/no','no',oneOf(['yes','no']));
 return accepted==='yes' ? ok({project,plan}) : fail('installation-canceled','Installation canceled; project files were not changed.','Rerun the installer when ready.');
};
/** Injected question and output effects let tests use the actual collection flow without a terminal. */
export const collectInstallation=async(io,options={})=>{
 const project=resolve(await value(io,'Project folder',options.project ?? process.cwd(),nonempty));
 const settings=await readJson(join(project,'.unified-plugin-framework.json'));
 const knowledge=await readJson(join(project,'.project-knowledge.json'));
 const saved=await readJson(join(project,'.upf-tools/setup-plan.json'));
 return !settings.ok ? settings : !knowledge.ok ? knowledge
  : settings.value!==null && !object(settings.value) || knowledge.value!==null && !object(knowledge.value)
    ? fail('invalid-settings','Saved project settings are not objects.','Preserve and repair existing settings before rerunning setup.')
    : !saved.ok ? saved : saved.value!==null && !parseBootstrap(saved.value).ok
      ? fail('invalid-saved-plan','The saved setup plan is invalid.','Preserve and repair it before rerunning setup, or use an explicit accepted --input plan.')
      : choose(io,project,settings.value,knowledge.value,{...options,savedPlan:saved.value});
};
/** Terminal boundary: EOF, cancellation and absent TTY never imply acceptance. */
export const interactiveInstallation=async options=>{
 return process.platform!=='linux' ? fail('unsupported-platform','Interactive setup currently runs on Linux.','Use the documented host payload path for this platform; existing configuration is preserved.')
  : !process.stdin.isTTY || !process.stdout.isTTY ? fail('terminal-required','Interactive installation needs a terminal.',
  'Run bash <(curl -fsSL …/install.sh) in a terminal, or supply --input for automation.') : terminal(options);
};
const terminal=async options=>{
 const rl=createInterface({input:process.stdin,output:process.stdout});
 return collectInstallation({ask:prompt=>rl.question(prompt),say:async message=>process.stdout.write(`${message}\n`)},options)
  .catch(()=>fail('installation-canceled','The terminal closed or installation was canceled.','Rerun from a terminal; no acceptance was inferred.')).finally(()=>rl.close());
};

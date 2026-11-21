// The wizard collects choices. The tooling lifecycle owns both inspection and setup.
import { constants } from 'node:fs';
import { access, lstat, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { configure, fail, ok, object, resolveLinearScope } from '@agent-plugins/project';
import { WORKFLOWS } from '@agent-plugins/workflows';
import { forHost, parseBootstrap } from '../dist/tooling-input.js';
import { HOST_NAMES } from '../dist/host-names.js';
import { HOSTS, claudeStateFile } from '../dist/host-table.js';
import { bootstrapHosts } from '../dist/tooling-bootstrap.js';
import { nodeToolingIO } from '../dist/tooling-node.js';
import { pick } from './installer-picker.mjs';

const canceled = () => fail('installation-canceled', 'Installation canceled; project files were not changed.', 'Rerun the installer when ready.');
const readJson = path => readFile(path, 'utf8').then(JSON.parse).then(ok).catch(error => error.code === 'ENOENT' ? ok(null)
  : fail('unreadable-settings', `Could not read ${path}.`, 'Preserve the existing file and correct it before rerunning the installer.'));

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const relativePath = value => nonempty(value) && !value.startsWith('/') && !value.includes('\\') && !value.includes(':')
  && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
const existingDirectory = value => nonempty(value) && lstat(resolve(value)).then(entry => entry.isDirectory(), () => false);
const languageTag = value => nonempty(value) && /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value);
const prompt = (label, rule, example, valid) => ({ label, rule, example, valid });
const folder = label => prompt(label, 'a project-relative folder', label === 'Planning documents folder' ? 'docs/work-items' : 'docs/notes', relativePath);
const PROMPTS = Object.freeze({
  project: prompt('Project folder', 'an existing directory', '.', existingDirectory),
  python: prompt('Python 3.12+ executable', 'an executable name or path', 'python3.12', nonempty),
  language: prompt('Language for communication and documents', 'a language tag', 'en', languageTag),
  artifacts: folder('Planning documents folder'),
  docs: folder('Developer documents folder'),
  vault: folder('Agent vault folder'),
  knowledge: folder('Project knowledge folder'),
  team: prompt('Linear team name or URL', 'a team name or URL', 'Engineering', nonempty),
  linearProject: prompt('Linear project name or URL', 'a project name or URL', 'Internal tools', nonempty),
});
const text = async (io, field, fallback) => {
  const { label, rule, example, valid } = PROMPTS[field];
  const answer = (await io.ask(`${label}${fallback === undefined ? '' : ` [${fallback}]`}: `)).trim() || fallback;
  if (await valid(answer)) return answer;
  await io.say(`That ${label[0].toLowerCase() + label.slice(1)} must be ${rule}, for example ${example}.`);
  return text(io, field, fallback);
};

const item = (value, label = value) => ({ value, label });
const select = async (io, options, next) => {
  const answer = await io.pick(options);
  return answer.kind === 'canceled' ? canceled() : next(answer.values);
};
const single = (io, title, items, initial, next) =>
  select(io, { title, items, initial: [initial], mode: 'single' }, ([choice]) => next(choice));
const checklist = (io, title, items, initial, next) => select(io, { title, items, initial, mode: 'checklist' }, next);
const consent = (io, title, next) => single(io, title, [item('yes', 'Allow'), item('no', 'Do not allow')], 'no', answer => next(answer === 'yes'));

const executable = path => stat(path).then(entry => entry.isFile() ? access(path, constants.X_OK).then(() => true) : false).catch(() => false);
const hostsOnPath = async path => {
  const folders = path === undefined ? [] : path.split(delimiter);
  const found = await Promise.all(HOST_NAMES.map(host => Promise.all(folders.map(dir => executable(resolve(dir, host)))).then(matches => matches.includes(true))));
  return HOST_NAMES.filter((_, index) => found[index]);
};

const linearTracker = async (io, lookup, current, next) => {
  await io.say('Linear uses its configured environment variable. Do not enter a credential here.');
  const team = current?.values?.team ?? await text(io, 'team');
  const project = current?.values?.project ?? await text(io, 'linearProject');
  const scope = await lookup({ team, project }, current);
  return scope.ok ? next({ ...current, adapter: 'linear', values: { ...current?.values, ...scope.value } }) : scope;
};
const tracker = (io, current, lookup, next) =>
  single(io, 'Tracker', [item('local', 'Local project files'), item('linear', 'Linear')], current?.adapter ?? 'local', adapter => {
    if (adapter === current?.adapter && configure(null, { language: 'en', artifactsPath: 'docs', tracker: current }).ok) return next(current);
    return adapter === 'local' ? next({ adapter: 'local', values: {} }) : linearTracker(io, lookup, current?.adapter === 'linear' ? current : undefined, next);
  });

const collectFolders = async (io, current, documentMode, next) => {
  const docsRoot = current?.docsRoot ?? await text(io, 'docs', 'docs');
  const vaultRoot = current?.vaultRoot ?? (documentMode === 'shared' ? docsRoot : await text(io, 'vault', 'docs/vault'));
  const knowledgeRoot = current?.knowledgeRoot ?? await text(io, 'knowledge', 'Project_Knowledge');
  return next({ documentMode, docsRoot, vaultRoot, knowledgeRoot });
};
const knowledgeChoices = (io, current, next) => current?.documentMode !== undefined
  ? collectFolders(io, current, current.documentMode, next)
  : single(io, 'Document layout', [item('shared', 'Shared documents'), item('separate', 'Separate documents and vault')], 'shared',
    mode => collectFolders(io, current, mode, next));

const choose = async (io, project, settings, knowledge, options) => {
  const detected = options.detectedHosts ?? await hostsOnPath(options.path ?? process.env.PATH);
  const workflows = Object.keys(WORKFLOWS);
  const saved = options.savedPlan;
  return checklist(io, 'Choose hosts', HOST_NAMES.map(name => item(name, HOSTS[name].label)), detected, hosts =>
    checklist(io, 'Choose workflows', workflows.map(name => item(name)), saved?.workflows ?? workflows, selected =>
      details(io, project, settings, knowledge, options, { hosts, workflows: selected, detected })));
};
const details = async (io, project, settings, knowledge, options, { hosts, workflows, detected }) => {
  const python = await text(io, 'python', options.python ?? options.savedPlan?.python ?? options.detectedPython ?? 'python3.12');
  const language = settings?.language ?? await text(io, 'language', 'en');
  const artifactsPath = settings?.artifactsPath ?? await text(io, 'artifacts', 'docs/work-items');
  const lookup = options.lookup ?? ((names, current) => resolveLinearScope(names, current)());
  const missingHosts = hosts.filter(name => !detected.includes(name));
  const collectConsent = next => missingHosts.length === 0 ? next(false) : consent(io, 'Install missing host CLIs?', next);
  return tracker(io, settings?.tracker, lookup, selected =>
    knowledgeChoices(io, knowledge, roots => collectConsent(installHostClis =>
      consent(io, 'Run headless knowledge discovery?', headlessDiscovery => complete(io, project, settings, {
        hosts, python, workflows, knowledge: roots, pluginRoots: [],
        consent: { privatePython: options.privatePython === true, installHostClis, headlessDiscovery },
        answers: { ...(settings ?? {}), language, artifactsPath, tracker: selected },
      }, options, missingHosts)))));
};

const inspectPlan = (project, plan) => {
  const environment = { claudeState: claudeStateFile(homedir(), process.env.CLAUDE_CONFIG_DIR) };
  // Host discovery launches the host. Defer discovery and tracker access to the accepted setup pass.
  const readOnly = { ...plan, steps: plan.steps.filter(step => step !== 'host-discovery' && step !== 'tracker' && step !== 'dependencies') };
  return bootstrapHosts(host => nodeToolingIO(project, forHost(readOnly, host), environment), false, readOnly)();
};
const complete = async (io, project, settings, plan, options, missingHosts) => {
  const answers = configure(settings, plan.answers);
  const accepted = answers.ok ? parseBootstrap({ ...plan, answers: answers.value }) : answers;
  if (!accepted.ok) return accepted;
  const report = await (options.preview ?? inspectPlan)(project, accepted.value);
  return report.ok ? confirm(io, project, accepted.value, options.version, report.value, missingHosts) : report;
};
const labels = hosts => hosts.map(name => HOSTS[name].label).join(', ');
const pendingSteps = report => report.steps.filter(({ status }) => status !== 'ready').map(({ step }) => step);
const list = values => values.length > 0 ? values.join(', ') : 'none';
const summary = (project, plan, version, report, missingHosts) => {
  const pending = pendingSteps(report.project);
  const hostWork = report.hosts.map(({ host, tooling }) => `${HOSTS[host].label} (${list(pendingSteps(tooling))})`);
  const otherHosts = HOST_NAMES.filter(name => !plan.hosts.includes(name));
  return [
    `\nInstall UPF ${version} into ${project}`,
    `Hosts: ${labels(plan.hosts)}`,
    `Workflows: ${plan.workflows.join(', ')}`,
    `Tracker: ${plan.answers.tracker.adapter}`,
    `Language: ${plan.answers.language}`,
    `Documents: ${plan.knowledge.docsRoot}; vault: ${plan.knowledge.vaultRoot}; knowledge: ${plan.knowledge.knowledgeRoot}`,
    `Install and configure: bundled release and pinned dependencies; project (${list(pending)}); host setup: ${list(hostWork)}.`,
    `Setup may back up an existing installer-owned .upf-tools/bin/agent-plugin launcher if it needs replacing.`,
    `Private Python: ${plan.consent.privatePython ? 'install the approved private runtime' : 'use the selected executable'}.`,
    `Host CLI installation: ${plan.consent.installHostClis ? `allowed for ${labels(missingHosts)}` : 'disabled'}.`,
    `Headless knowledge discovery: ${plan.consent.headlessDiscovery ? 'allowed on a signed-in selected host' : 'disabled'}.`,
    `Not changing: unrelated project settings${otherHosts.length > 0 ? ` and deselected hosts (${labels(otherHosts)})` : ''}.`,
  ].join('\n');
};
const confirm = async (io, project, plan, version, report, missingHosts) => {
  await io.say(summary(project, plan, version, report, missingHosts));
  return single(io, 'Apply this setup?', [item('install', 'Install'), item('cancel', 'Cancel')], 'cancel',
    choice => choice === 'install' ? ok({ project, plan }) : canceled());
};

const savedSettings = async project => {
  const settings = await readJson(join(project, '.unified-plugin-framework.json'));
  const visibleKnowledge = await readJson(join(project, 'project-knowledge.json'));
  const legacyKnowledge = await readJson(join(project, '.project-knowledge.json'));
  const saved = await savedPlanOf(project);
  if (!settings.ok) return settings;
  if (!visibleKnowledge.ok) return visibleKnowledge;
  if (!legacyKnowledge.ok) return legacyKnowledge;
  if ([settings.value, visibleKnowledge.value, legacyKnowledge.value].some(value => value !== null && !object(value))) {
    return fail('invalid-settings', 'Saved project settings are not objects.', 'Preserve and repair existing settings before rerunning setup.');
  }
  if (visibleKnowledge.value !== null && legacyKnowledge.value !== null
    && visibleKnowledge.value.knowledgeRoot !== legacyKnowledge.value.knowledgeRoot) {
    return fail('invalid-settings', 'Conflicting knowledge locators found in project-knowledge.json and .project-knowledge.json.', 'Reconcile both files to one shared knowledgeRoot before rerunning setup.');
  }
  const knowledge = visibleKnowledge.value ?? legacyKnowledge.value;
  return !saved.ok && saved.error.code !== 'invalid-saved-plan' ? saved
    : ok({ settings: settings.value, knowledge, savedPlan: saved.ok ? saved.value : null, savedPlanInvalid: !saved.ok });
};
// A saved plan only supplies earlier answers: one that is not valid JSON or not a valid plan is set aside after confirmation.
const savedPlanOf = project => readFile(join(project, '.upf-tools/setup-plan.json'), 'utf8')
  .then(text => Promise.resolve(text).then(JSON.parse).then(parseBootstrap, () => fail('invalid-saved-plan', 'The saved setup plan is not valid JSON.', '')),
    error => error.code === 'ENOENT' ? ok(null)
      : fail('unreadable-settings', 'Could not read the saved setup plan.', 'Preserve the existing file and correct it before rerunning the installer.'))
  .then(plan => plan.ok || plan.error.code === 'unreadable-settings' ? plan : fail('invalid-saved-plan', 'The saved setup plan is invalid.', ''));
const INVALID_PLAN_NOTE = 'The saved setup plan could not be read, so the questions are asked again. After you confirm, it is kept beside the new plan as setup-plan.json.broken-<time>.';

/** Inject questions and output while keeping the same validation and plan collection. */
export const collectInstallation = async (io, options = {}) => {
  const project = resolve(await text(io, 'project', options.project ?? process.cwd()));
  const saved = await savedSettings(project);
  if (saved.ok && saved.value.savedPlanInvalid) await io.say(INVALID_PLAN_NOTE);
  return saved.ok ? choose(io, project, saved.value.settings, saved.value.knowledge, { ...options, savedPlan: saved.value.savedPlan }) : saved;
};

const terminalQuestion = async (input, output, message) => {
  const interface_ = createInterface({ input, output });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  interface_.once('close', cancel);
  process.once('SIGHUP', cancel);
  try {
    return await interface_.question(message, { signal: controller.signal });
  } finally {
    process.off('SIGHUP', cancel);
    interface_.close();
  }
};
const terminal = options => collectInstallation({
  // Each text question closes readline before the next prompt takes control of the same input.
  ask: message => terminalQuestion(process.stdin, process.stderr, message),
  pick: choice => pick(choice, { input: process.stdin, output: process.stderr }),
  say: async message => process.stderr.write(`${message}\n`),
}, options).catch(error => error.name === 'AbortError' || error.code === 'ERR_USE_AFTER_CLOSE' ? canceled()
  : fail('wizard-failed', 'Could not collect the installation choices.', 'Check the terminal and project settings, then rerun the installer.'));

/** Terminal boundary: cancellation and absent interactive input never imply acceptance. */
export const interactiveInstallation = async options => process.platform !== 'linux'
  ? fail('unsupported-platform', 'Interactive setup currently runs on Linux.', 'Use the documented host payload path for this platform; existing configuration is preserved.')
  : !process.stdin.isTTY ? fail('terminal-required', 'Interactive installation needs a terminal.',
    'Run the installer in a terminal, or supply --input for automation.') : terminal(options);

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectInstallation } from '../scripts/installer-wizard.mjs';

const savedKnowledge = { documentMode: 'shared', docsRoot: 'docs', vaultRoot: 'docs', knowledgeRoot: 'knowledge' };
const savedSettings = { schemaVersion: 1, language: 'pt-BR', artifactsPath: 'plans', tracker: { adapter: 'local', values: {} }, unrelated: 'keep' };
const setup = async (settings = savedSettings) => {
  const project = await mkdtemp(join(tmpdir(), 'upf-wizard-'));
  await writeFile(join(project, '.unified-plugin-framework.json'), JSON.stringify(settings));
  await writeFile(join(project, '.project-knowledge.json'), JSON.stringify(savedKnowledge));
  return project;
};
const preview = async () => ({
  ok: true,
  value: {
    project: { steps: [{step: 'knowledge-runtime', status: 'action-required'}] },
    hosts: [{host: 'codex', tooling: {steps: [{step: 'skills', status: 'ready'}]}}],
  },
});
const questions = ({ answers = [], choices = {}, options = {} } = {}) => {
  const asked = [];
  const shown = [];
  const output = [];
  const io = {
    ask: async prompt => {
      assert.ok(asked.length < answers.length + 10, 'unexpected repeated text prompt');
      asked.push(prompt);
      return answers[asked.length - 1] ?? '';
    },
    pick: async prompt => {
      shown.push(prompt);
      return Object.hasOwn(choices, prompt.title) && choices[prompt.title] === null
        ? { kind: 'canceled' }
        : { kind: 'picked', values: choices[prompt.title] ?? prompt.initial };
    },
    say: async message => { output.push(message); },
  };
  return { asked, shown, output, run: project => collectInstallation(io, { project, version: '0.2.2', preview, detectedHosts: ['codex'], ...options }) };
};

test('fresh wizard asks for explicit consent and previews both hosts before accepting', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-wizard-fresh-'));
  const planCalls = [];
  const q = questions({
    choices: {
      'Choose hosts': ['codex', 'claude'],
      'Install missing host CLIs?': ['yes'],
      'Run headless knowledge discovery?': ['yes'],
      'Apply this setup?': ['install'],
    },
    options: { preview: async (target, plan) => { planCalls.push({target, plan}); return preview(); } },
  });
  const result = await q.run(project);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value.plan.hosts, ['codex', 'claude']);
  assert.deepEqual(result.value.plan.consent, {privatePython: false, installHostClis: true, headlessDiscovery: true});
  assert.equal(result.value.plan.answers.tracker.adapter, 'local');
  assert.equal(result.value.plan.workflows.length, 5);
  assert.deepEqual(planCalls, [{target: project, plan: result.value.plan}]);
  assert.equal(q.output.filter(line => line.includes('Install UPF')).length, 1);
  assert.match(q.output.join('\n'), /knowledge runtime|knowledge-runtime/i);
  assert.match(q.output.join('\n'), /may back up/i);
  assert.match(q.output.join('\n'), /Not changing/);
  assert.deepEqual(await readdir(project), []);
});

test('only executable hosts found on PATH start checked and saved workflows and Python are reused', async () => {
  const project = await setup();
  const tools = await mkdtemp(join(tmpdir(), 'upf-wizard-path-'));
  await writeFile(join(tools, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(tools, 'codex'), 'not executable', { mode: 0o644 });
  await mkdir(join(project, '.upf-tools'));
  await writeFile(join(project, '.upf-tools/setup-plan.json'), JSON.stringify({ host: 'codex', python: 'python3.13', workflows: ['continuity'], pluginRoots: [], knowledge: savedKnowledge }));
  const q = questions({ options: { path: tools, detectedHosts: undefined } });
  const result = await q.run(project);
  assert.equal(result.error.code, 'installation-canceled');
  assert.deepEqual(q.shown.find(prompt => prompt.title === 'Choose hosts').initial, ['claude']);
  assert.deepEqual(q.shown.find(prompt => prompt.title === 'Choose workflows').initial, ['continuity']);
  assert.deepEqual(q.shown.find(prompt => prompt.title === 'Apply this setup?').initial, ['cancel']);
  assert.ok(q.asked.includes('Python 3.12+ executable [python3.13]: '));
  assert.ok(!q.asked.some(prompt => prompt.startsWith('Language')));
  assert.match(q.output.join('\n'), /Not changing[^\n]*Codex/);
});

test('rejected free-text answers are explained with a valid example and never echoed', async () => {
  const project = await setup({ ...savedSettings, artifactsPath: undefined });
  const q = questions({ answers: ['', '', '../invalid-secret-path', 'docs/plans'], choices: { 'Apply this setup?': ['install'] } });
  const result = await q.run(project);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.plan.answers.artifactsPath, 'docs/plans');
  assert.equal(result.value.plan.answers.unrelated, 'keep');
  assert.match(q.output.join('\n'), /That planning documents folder must be a project-relative folder, for example docs\/work-items\./);
  assert.doesNotMatch(q.output.join('\n'), /invalid-secret-path/);
});

test('canceling a picker produces the cancellation message and leaves project files untouched', async () => {
  const project = await setup();
  const settingsPath = join(project, '.unified-plugin-framework.json');
  const original = await readFile(settingsPath);
  const q = questions({ choices: { 'Choose hosts': null } });
  const result = await q.run(project);
  assert.equal(result.error.message, 'Installation canceled; project files were not changed.');
  assert.deepEqual(q.shown.map(prompt => prompt.title), ['Choose hosts']);
  assert.deepEqual(await readFile(settingsPath), original);
  assert.deepEqual((await readdir(project)).sort(), ['.project-knowledge.json', '.unified-plugin-framework.json']);
});

test('Linear lookup failure is surfaced as its own failure before confirmation', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-wizard-linear-'));
  const q = questions({ answers: ['', '', '', '', 'Team', 'Project'], choices: { Tracker: ['linear'] }, options: {lookup: async names => {
    assert.deepEqual(names, {team: 'Team', project: 'Project'});
    return {ok:false, error:{code:'authentication-needed', message:'Set environment', recovery:'retry'}};
  }} });
  assert.equal((await q.run(project)).error.code, 'authentication-needed');
  assert.ok(!q.shown.some(prompt => prompt.title === 'Apply this setup?'));
});

test('partial saved Linear scope preserves connection choices', async () => {
  const team = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const connection = {url: 'https://mcp.linear.app/mcp', tokenEnv: 'PROJECT_LINEAR_TOKEN'};
  const project = await setup({ ...savedSettings, tracker: { adapter: 'linear', values: {team}, connection } });
  const q = questions({ answers: ['', '', 'Project'], choices: { 'Apply this setup?': ['install'] }, options: {lookup: async (names, current) => {
    assert.deepEqual(names, {team, project: 'Project'});
    assert.deepEqual(current.connection, connection);
    return {ok:true, value:{team, project: projectId}};
  }} });
  const result = await q.run(project);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value.plan.answers.tracker.connection, connection);
  assert.ok(!q.asked.some(prompt => prompt.startsWith('Linear team')));
});

test('malformed configuration and a failed read-only preview stop before confirmation', async () => {
  const project = await setup();
  const q = questions({ options: {preview: async () => ({ok:false, error:{code:'preview-failed'}})} });
  assert.equal((await q.run(project)).error.code, 'preview-failed');
  assert.ok(!q.shown.some(prompt => prompt.title === 'Apply this setup?'));
  await mkdir(join(project, '.upf-tools'));
  await writeFile(join(project, '.upf-tools/setup-plan.json'), '{}');
  assert.equal((await questions().run(project)).error.code, 'invalid-saved-plan');
  await writeFile(join(project, '.unified-plugin-framework.json'), '{invalid');
  assert.equal((await questions().run(project)).error.code, 'unreadable-settings');
});

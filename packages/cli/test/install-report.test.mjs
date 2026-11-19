import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { finishInstall } from '../scripts/install-report.mjs';
import { RECOVERY_CODES, exitCodeOf, recoveryFor } from '../dist/tooling-recovery.js';

const envelope = (steps, extra = {}) => JSON.stringify({ ok: true, value: {
  mode: 'apply', status: 'action-required', hosts: [{ host: 'claude', tooling: { steps } }], ...extra,
} });

test('final report formats host labels, backups, login commands and the exact hand-off', () => {
  const result = finishInstall(envelope([
    { step: 'host-discovery', status: 'action-required', failure: {
      code: 'host-sign-in-needed', class: 'user-action', message: 'Sign in\u001b[31m now\u001b[0m', recovery: 'Sign in to the assistant and retry.',
    } },
  ], { backups: ['/project/.upf-tools/bin/agent-plugin.upf-backup-one'], handoffs: ['knowledge-discovery'] }));
  assert.equal(result.exitCode, 2);
  assert.match(result.message, /Claude Code: host-discovery/);
  assert.match(result.message, /Sign in with: claude auth login/);
  assert.match(result.message, /Backups saved: \/project\/\.upf-tools\/bin\/agent-plugin\.upf-backup-one/);
  assert.match(result.message, /Use the project-bootstrap skill to finish setup/);
  assert.doesNotMatch(result.message, /\u001b|\u001b\[31m/);
  const codex = finishInstall(envelope([{ step: 'host-discovery', status: 'action-required', failure: {
    code: 'host-sign-in-needed', class: 'user-action',
  } }], { hosts: [{ host: 'codex', tooling: { steps: [{ step: 'host-discovery', status: 'action-required', failure: {
    code: 'host-sign-in-needed', class: 'user-action',
  } }] } }] }));
  assert.match(codex.message, /Sign in with: codex login/);
  assert.equal(finishInstall(envelope([{ step: 'settings', status: 'action-required', failure: { class: 'user-action' } }]), { strict: true }).exitCode, 1);
});

test('every documented recovery code selects its recovery class exit code', () => {
  RECOVERY_CODES.map((code) => {
    const recovery = recoveryFor('skills', code);
    const result = finishInstall(envelope([{ step: 'skills', status: 'action-required', failure: {
      code, class: recovery.onFailure.class, message: `${code} message`, recovery: recovery.onFailure.instruction,
    } }]));
    assert.equal(result.exitCode, exitCodeOf(recovery.onFailure.class), code);
    assert.match(result.message, new RegExp(`${code} message`), code);
  });
  const stepSpecific = recoveryFor('knowledge-server', 'tooling-missing');
  assert.equal(finishInstall(envelope([{ step: 'knowledge-server', status: 'action-required', failure: {
    code: 'tooling-missing', class: stepSpecific.onFailure.class, recovery: stepSpecific.onFailure.instruction,
  } }])).exitCode, exitCodeOf(stepSpecific.onFailure.class));
});

test('Stop and Preserve outrank hand-off, while strict converts pending work to exit one', () => {
  const steps = [
    { step: 'knowledge', status: 'action-required', failure: { class: 'hand-off' } },
    { step: 'settings', status: 'action-required', failure: { class: 'preserve' } },
  ];
  assert.equal(finishInstall(envelope(steps)).exitCode, 1);
  assert.equal(finishInstall(envelope([steps[0]])).exitCode, 2);
  assert.equal(finishInstall(envelope([steps[0]]), { strict: true }).exitCode, 1);
});

test('report-to-process boundary propagates ready, hand-off, stop and strict exit codes', () => {
  const cases = [
    [envelope([] , { status: 'ready', hosts: [] }), false, 0],
    [envelope([{ step: 'host-discovery', status: 'action-required', failure: { class: 'hand-off', message: 'Sign in' } }]), false, 2],
    [envelope([{ step: 'settings', status: 'action-required', failure: { class: 'preserve', message: 'Conflict' } }]), false, 1],
    [envelope([{ step: 'host-discovery', status: 'action-required', failure: { class: 'hand-off', message: 'Sign in' } }]), true, 1],
  ];
  cases.forEach(([input, strict, expected]) => {
    const source = `import {finishInstall} from ${JSON.stringify(new URL('../scripts/install-report.mjs', import.meta.url).href)};\n` +
      `process.exitCode=finishInstall(${JSON.stringify(input)},{strict:${strict}}).exitCode;`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
    assert.equal(result.status, expected);
  });
});

test('valid failure envelopes retain their recovery message and fail closed without a class', () => {
  const result = finishInstall(JSON.stringify({ ok: false, error: {
    message: 'Configuration could not be read.', recovery: 'Check the file and retry.\u001b',
  } }));
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /Configuration could not be read/);
  assert.doesNotMatch(result.message, /\u001b/);
});

test('final report consumes real runTooling JSON output', async () => {
  const project = await mkdtemp(join(tmpdir(), 'upf-install-report-'));
  const plan = join(project, 'plan.json');
  const backupDirectory = join(project, '.upf-tools', 'bin');
  const backup = join(backupDirectory, 'agent-plugin.upf-backup-fixture');
  await mkdir(backupDirectory, { recursive: true });
  await writeFile(backup, 'prior launcher');
  await writeFile(join(project, '.unified-plugin-framework.json'), JSON.stringify({
    schemaVersion: 1, language: 'en', artifactsPath: 'docs/work-items', tracker: { adapter: 'local', values: {} },
  }));
  await writeFile(plan, JSON.stringify({ host: 'codex', python: 'python3.12', workflows: ['continuity'], pluginRoots: [],
    knowledge: { knowledgeRoot: 'knowledge', documentMode: 'shared', docsRoot: 'docs', vaultRoot: 'docs' }, steps: ['settings'],
    answers: { language: 'en', artifactsPath: 'docs/work-items', tracker: { adapter: 'local', values: {} } } }));
  const cli = fileURLToPath(new URL('../dist/index.js', import.meta.url));
  const stdout = execFileSync(process.execPath, [cli, 'project', 'bootstrap', '--input', plan, '--project', project], { encoding: 'utf8' });
  const result = finishInstall(stdout);
  assert.equal(result.exitCode, 0);
  assert.match(result.message, /Hosts: Codex/);
  assert.match(result.message, new RegExp(backup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

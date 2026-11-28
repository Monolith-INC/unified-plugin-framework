import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run as runCli } from '../dist/index.js';

const quickWork = { mode: 'discover-quick', selected: [], results: [{ step: 'brainstorming', status: 'completed', evidence: 'The user selected a date without a time.' }] };
const material = '[Due dates design](docs/due-dates.md)';
const run = (operation, input, root = '.') => {
  const lines = [];
  const io = { out: (line) => lines.push(line), err: (line) => lines.push(line), cwd: () => root, claudeState: () => '' };
  const code = runCli(['question', operation, JSON.stringify(input)], io);
  return { code, output: JSON.parse(lines[0]) };
};
const context = {
  instance: 'session/step/1', answered: false, channel: 'needs-input', displayedKeys: ['yes', 'no'], acceptKey: 'yes',
  question: { kind: 'confirm', explanation: 'Apply?', acceptLabel: 'Apply', declineLabel: 'Decline', safeDefault: 'decline' },
};

test('host uses one decision contract from preparation through an explicit response', () => {
  const prepared = run('prepare', { context, capabilities: { native: null, canvas: null, reply: true }, required: true });
  assert.equal(prepared.code, 0);
  assert.equal(prepared.output.kind, 'text');
  const answer = run('answer', { context: prepared.output.continuation, response: { channel: 'text', instance: context.instance, value: '1' } });
  assert.equal(answer.output.kind, 'answer');
  assert.equal(answer.output.consent, 'accepted');
  assert.equal(run('answer', { context: prepared.output.continuation, response: { channel: 'text', instance: 'old', value: '1' } }).output.kind, 'ignored');
});

test('no reply channel preserves the pending decision and malformed inputs fail safely', () => {
  const prepared = run('prepare', { context, capabilities: { native: null, canvas: null, reply: false }, required: true });
  assert.equal(prepared.output.kind, 'needs-input');
  assert.equal(prepared.output.continuation.instance, context.instance);
  assert.notEqual(run('answer', { context: null, response: {} }).code, 0);
});

test('host callbacks retain displayed keys and literal custom answers', () => {
  const choice = { instance: 's/2', answered: false, channel: 'needs-input', displayedKeys: ['b', 'a'],
    question: { kind: 'several', explanation: 'Choose', allowOther: true, options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] } };
  const prepared = run('prepare', { context: choice, capabilities: { native: null, canvas: null, reply: true }, required: true }).output;
  const other = run('answer', { context: prepared.continuation, response: { channel: 'text', instance: choice.instance, value: '1,3' } }).output;
  assert.deepEqual(other, { kind: 'needs-custom', instance: choice.instance, keys: ['b'] });
  const continuation = { ...prepared.continuation, pendingCustomKeys: other.keys };
  const result = run('answer', { context: continuation, response: { channel: 'text', instance: choice.instance, value: '  Other text  ' } }).output;
  assert.deepEqual(result, { kind: 'answer', instance: choice.instance, keys: ['b'], custom: '  Other text  ', consent: null });
  assert.equal(run('answer', { context: { ...continuation, answered: true }, response: { channel: 'text', instance: choice.instance, value: 'again' } }).output.kind, 'ignored');
});

test('discovery next resumes a closed-input decision through the command boundary', () => {
  const state = { session: 'session', occurrence: 0, node: 'context', phase: 'active' };
  const capabilities = { native: null, canvas: null, reply: false };
  const waiting = run('next', { state, event: { kind: 'ask', capabilities } }).output;
  assert.equal(waiting.kind, 'needs-input');
  assert.equal(run('next', { state: waiting.state }).output.kind, 'needs-input');
  const connected = run('next', { state: waiting.state, event: { kind: 'connect', capabilities: { ...capabilities, reply: true } } }).output;
  const response = { channel: 'text', instance: connected.state.pending.instance, value: '1' };
  const result = run('next', { state: connected.state, event: { kind: 'answer', response } }).output;
  assert.equal(result.state.node, 'conversation');
  assert.equal(result.guidance.node, 'conversation');
  assert.notEqual(run('next', { state: { phase: 'waiting' } }).code, 0);
});

test('replacing failed native input preserves the question and rejects its old answer', () => {
  const state = { session: 'recovery', occurrence: 0, node: 'context', phase: 'active' };
  const capabilities = { native: { single: true, several: false, consent: false, custom: true }, canvas: null, reply: true };
  const waiting = run('next', { state, event: { kind: 'ask', capabilities } }).output.state;
  const old = waiting.pending.instance;
  const recovery = run('next', { state: waiting, event: { kind: 'recover-input', instance: old, reply: false } }).output;
  assert.equal(recovery.kind, 'needs-input');
  assert.notEqual(recovery.state.pending.instance, old);
  assert.deepEqual(recovery.state.pending.question, waiting.pending.question);
  const reconnected = run('next', { state: recovery.state, event: { kind: 'connect', capabilities } }).output;
  const late = run('next', { state: reconnected.state, event: {
    kind: 'answer', response: { channel: 'native', instance: old, keys: ['conversation'] },
  } }).output;
  assert.equal(late.kind, 'invalid-event');
  assert.equal(late.state.node, 'context');
});

test('elicitation selections stay in the discovery continuation', () => {
  const state = { session: 's', occurrence: 3, node: 'elicitation', phase: 'active' };
  const action = (state, action) => run('next', { state, event: { kind: 'elicitation', session: 's', occurrence: 3, eventId: action.kind, action } }).output;
  const offered = action(state, { kind: 'offer', methods: ['risk', 'premortem'] });
  const chosen = action(offered.state, { kind: 'choose', methods: ['risk'] });
  assert.equal(chosen.state.elicitation.kind, 'running');
  assert.equal(action(chosen.state, { kind: 'choose', methods: ['risk'] }).kind, 'interaction-failure');
  const paused = run('next', { state: chosen.state, event: { kind: 'pause' } }).output;
  assert.deepEqual(run('next', { state: paused.state, event: { kind: 'resume' } }).output.state, chosen.state);
});

test('discovery question uses saved-language wording without changing answer keys', () => {
  const state = { session: 's', occurrence: 0, node: 'context', phase: 'active' };
  const capabilities = { native: null, canvas: null, reply: true };
  const event = { kind: 'ask', capabilities, language: 'pt-br' };
  assert.equal(run('next', { state, event }).output.kind, 'recovery');
  const wording = { explanation: 'Como continuar?', labels: { conversation: 'Conversar', design: 'Prosseguir' } };
  const result = run('next', { state, event: { ...event, wording } }).output;
  assert.equal(result.state.pending.question.explanation, wording.explanation);
  assert.deepEqual(result.state.pending.displayedKeys, ['conversation', 'design']);
  assert.equal(result.state.pending.question.options[0].label, 'Conversar');
});

test('restored review rejects a pending decision from an older revision', () => {
  const state = { session: 's', occurrence: 1, node: 'review', phase: 'active', revision: 'r1', material, work: quickWork };
  const capabilities = { native: null, canvas: null, reply: true };
  const pending = run('next', { state, event: { kind: 'ask', capabilities } }).output.state;
  const response = { channel: 'text', instance: pending.pending.instance, value: '2' };
  const result = run('next', { state: { ...pending, revision: 'r2' }, event: { kind: 'answer', response, revision: 'r2' } }).output;
  assert.equal(result.kind, 'recovery');
});

test('custom response can be retried with a fresh decision instance', () => {
  const state = { session: 's', occurrence: 0, node: 'context', phase: 'active' };
  const capabilities = { native: null, canvas: null, reply: true };
  const ask = (value) => run('next', { state: value, event: { kind: 'ask', capabilities } }).output.state;
  const pending = ask(state);
  const response = (value) => ({ kind: 'answer', response: { channel: 'text', instance: pending.pending.instance, value } });
  const other = run('next', { state: pending, event: response('3') }).output;
  assert.equal(other.kind, 'needs-custom');
  const custom = run('next', { state: other.state, event: response('other idea') }).output;
  assert.equal(custom.kind, 'needs-clarification');
  assert.equal(run('next', { state: custom.state }).output.custom, 'other idea');
  assert.equal(run('next', { state: custom.state, event: response('1') }).output.kind, 'invalid-event');
  const retried = run('next', { state: custom.state, event: { kind: 'retry' } }).output;
  const fresh = ask(retried.state);
  assert.notEqual(fresh.pending.instance, pending.pending.instance);
  assert.equal(run('next', { state: fresh, event: { kind: 'answer', response: { channel: 'text', instance: fresh.pending.instance, value: '1' } } }).output.state.node, 'conversation');
});

test('explicit facts resolve one direction and reject conflicting facts', () => {
  const state = { session: 's', occurrence: 0, node: 'context', phase: 'active' };
  const event = { kind: 'facts', facts: { clear: true, discuss: false }, context: 'Fix a typo' };
  const result = run('next', { state, event }).output;
  assert.equal(result.state.node, 'design');
  assert.equal(result.guidance.context, 'Fix a typo');
  assert.equal(run('next', { state, event: { ...event, facts: { clear: true, discuss: true } } }).output.kind, 'recovery');
});

test('optional multi-selection accepts none from each prepared channel and required choices remain pending', () => {
  const question = { kind: 'several', explanation: 'Choose passes', options: [{ key: 'forge', label: 'Forge' }], allowOther: true };
  const context = { instance: 'catalog', question, answered: false, channel: 'needs-input', displayedKeys: ['forge'] };
  const capable = { single: true, several: true, consent: false, custom: true };
  for (const kind of ['text', 'native', 'canvas']) {
    const capabilities = { native: null, canvas: null, reply: true, ...(kind === 'text' ? {} : { [kind]: capable }) };
    const response = { channel: kind, instance: 'catalog', ...(kind === 'text' ? { value: 'none' } : { keys: [] }) };
    for (const required of [false, true]) {
      const prepared = run('prepare', { context, required, capabilities }).output;
      assert.equal(prepared.answerForms.includes('none'), !required);
      assert.equal(run('answer', { context: prepared.continuation, response }).output.kind, required ? 'invalid' : 'answer');
    }
  }
});

test('DAY-002 selected skills, design presentation, and approval survive CLI round trips', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'upf-forge-question-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const step = (state, event) => run('next', { state, event }, root).output;
  const initial = { session: 'day-002', occurrence: 0, node: 'context', phase: 'active' };
  const select = { kind: 'select-skills', mode: 'discover-quick', selected: ['bmad-forge-idea', 'bmad-review:adversarial+edge-case-hunter'] };
  const selected = step(initial, select).state;
  const design = step(selected, { kind: 'facts', facts: { clear: true, discuss: false } }).state;
  assert.equal(design.node, 'design');
  const show = { kind: 'advance', revision: 'r1', material };
  assert.match(step(design, show).instruction, /brainstorming/);
  const record = (state, result) => step(state, { kind: 'skill-result', ...result }).state;
  const lead = record(design, quickWork.results[0]);
  assert.match(step(lead, show).instruction, /bmad-forge-idea/);
  assert.notEqual(run('next', { state: design, event: { kind: 'skill-result', step: 'brainstorming', evidence: 'Not run' } }, root).code, 0);
  const forge = { kind: 'skill-result', step: 'bmad-forge-idea', status: 'completed', sessionRecord: 'forge-dates/.memlog.md', evidence: 'Hardened: the date uses the local calendar.' };
  const missing = step(lead, forge);
  assert.equal(missing.kind, 'recovery');
  assert.equal(missing.state.work.results.find((result) => result.step === forge.step).status, 'failed');
  assert.equal(step(missing.state, show).instruction, missing.instruction);
  const session = join(root, 'forge-dates');
  mkdirSync(session);
  const memlog = join(session, '.memlog.md');
  const report = join(session, 'forge-report.html');
  const writeMemlog = (status) => writeFileSync(memlog, `---
status: ${status}
---

- (decision) use the local calendar
`);
  writeMemlog('in-progress');
  writeFileSync(report, '<!doctype html><html><body>HARDENED</body></html>');
  assert.equal(step(missing.state, forge).kind, 'recovery');
  writeMemlog('complete');
  symlinkSync(session, join(root, 'alias'), 'dir');
  assert.equal(step(missing.state, { ...forge, sessionRecord: 'alias/.memlog.md' }).kind, 'recovery');
  const forged = step(missing.state, forge).state;
  assert.equal(step(forged, { kind: 'advance', revision: 'r1' }).kind, 'recovery');
  const review = step(forged, show).state;
  const ask = { kind: 'ask', capabilities: { native: null, canvas: null, reply: true } };
  const lensEvidence = (lens) => ({ kind: 'skill-result', step: 'bmad-review:' + lens, status: 'completed', evidence: 'Returned findings in review.md', revision: 'r1', material });
  const lens = (state, lens) => step(state, lensEvidence(lens)).state;
  assert.match(step(review, ask).instruction, /adversarial/);
  const partial = lens(review, 'edge-case-hunter');
  assert.match(step(partial, ask).instruction, /adversarial/);
  const failedLens = step(partial, { kind: 'skill-result', step: 'bmad-review:adversarial', revision: 'r1', material,
    status: 'failed', evidence: 'The reviewer returned no result.', recovery: 'Restore the adversarial lens and rerun it.' });
  assert.equal(failedLens.kind, 'recovery');
  assert.equal(step(failedLens.state, ask).instruction, failedLens.instruction);
  const reviewed = lens(failedLens.state, 'adversarial');
  const waiting = step(reviewed, ask).state;
  assert.ok(waiting.pending.question.explanation.startsWith(material));
  assert.ok(waiting.pending.question.explanation.includes('r1'));
  const revised = step(waiting, { kind: 'review-revision', revision: 'r2', material: 'Changed design' }).state;
  assert.match(step(revised, ask).instruction, /adversarial/);
  const reusingRevision = step(waiting, { kind: 'review-revision', revision: 'r1', material: 'Different design, same label' }).state;
  const staleLens = step(reusingRevision, lensEvidence('adversarial'));
  assert.equal(staleLens.kind, 'recovery');
  assert.match(step(staleLens.state, ask).instruction, /adversarial/);
  assert.match(step({ ...reusingRevision, work: reviewed.work }, ask).instruction, /adversarial/);
  const current = (state, lens) => step(state, { ...lensEvidence(lens), material: reusingRevision.material }).state;
  assert.equal(step(current(current(reusingRevision, 'adversarial'), 'edge-case-hunter'), ask).kind, 'waiting');
  const complete = step(waiting, { kind: 'answer', revision: 'r1', response: { channel: 'text', instance: waiting.pending.instance, value: '2' } });
  assert.equal(complete.state.node, 'complete');
  assert.equal(complete.state.approvedInstance, waiting.pending.instance);
  writeMemlog('in-progress');
  assert.equal(step(waiting, { kind: 'answer', revision: 'r1', response: { channel: 'text', instance: waiting.pending.instance, value: '2' } }).kind, 'recovery');
  assert.equal(step(complete.state).kind, 'recovery');
  assert.equal(step({ ...initial, node: 'execute' }).kind, 'recovery');
  assert.equal(step({ ...initial, node: 'complete' }).kind, 'recovery');
});

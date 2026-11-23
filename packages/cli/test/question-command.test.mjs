import assert from 'node:assert/strict';
import test from 'node:test';
import { run as runCli } from '../dist/index.js';

const run = (operation, input) => {
  const lines = [];
  const io = { out: (line) => lines.push(line), err: (line) => lines.push(line), cwd: () => '.', claudeState: () => '' };
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

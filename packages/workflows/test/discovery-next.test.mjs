import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDiscovery } from '../dist/discovery-next.js';

const quickWork = { mode: 'discover-quick', selected: [], results: [{ step: 'brainstorming', status: 'completed', evidence: 'The user selected a date without a time.' }] };
const material = '[Due dates design](docs/due-dates.md)';
const initial = { session: 'session-1', occurrence: 0, node: 'context', phase: 'active' };
const next = (state, event) => nextDiscovery(state, event);
const closed = { native: null, canvas: null, reply: false };
const open = { ...closed, reply: true };
const ask = { kind: 'ask', capabilities: closed };
const connect = (state) => next(state, { kind: 'connect', capabilities: open }).state;
const answer = (instance, value, revision) => ({ kind: 'answer', response: { channel: 'text', instance, value }, revision });

test('explicit decisions use the storyboard and a fresh occurrence on each visit', () => {
  const waiting = next(initial, ask);
  assert.equal(waiting.kind, 'needs-input');
  assert.equal(waiting.state.pending.instance, JSON.stringify(['session-1', 0, null]));
  assert.deepEqual(next(waiting.state), next(waiting.state));
  const advanced = next(connect(waiting.state), answer(waiting.state.pending.instance, '1'));
  assert.equal(advanced.state.node, 'conversation');
  assert.equal(advanced.state.occurrence, 1);
  assert.equal(advanced.guidance.node, 'conversation');
  const again = next(advanced.state, ask);
  assert.equal(again.state.pending.instance, JSON.stringify(['session-1', 1, null]));
  const connected = connect(again.state);
  assert.deepEqual(next(connected, answer(waiting.state.pending.instance, '1')).state, connected);
});

test('invalid answers, pause and obsolete approvals preserve pending work', () => {
  const review = { session: 's', occurrence: 3, node: 'review', phase: 'active', revision: 'r1', material, work: quickWork };
  const pending = connect(next(review, ask).state);
  const instance = pending.pending.instance;
  assert.deepEqual(next(pending, answer(instance, '2', 'r2')).state, pending);
  assert.deepEqual(next(pending, answer(instance, '99', 'r1')).state, pending);
  const paused = next(pending, { kind: 'pause' }).state;
  assert.deepEqual(next(paused, answer(instance, '2', 'r1')).state, paused);
  const resumed = next(paused, { kind: 'resume' }).state;
  assert.deepEqual(resumed, pending);
  const done = next(resumed, answer(instance, '2', 'r1'));
  assert.equal(done.state.node, 'complete');
  assert.deepEqual(next(done.state, answer(instance, '2', 'r1')).state, done.state);
});

test('missing, invalid and conflicting inputs return recoverable results', () => {
  assert.equal(next(undefined).kind, 'recovery');
  assert.equal(next({ ...initial, node: 'missing' }).kind, 'recovery');
  assert.equal(next({ ...initial, node: 'review' }, ask).kind, 'recovery');
  assert.deepEqual(next(initial).state, initial);
});

test('single directions advance only on an event and changed reviews invalidate prior answers', () => {
  const design = { ...initial, node: 'design', work: quickWork };
  assert.deepEqual(next(design).state, design);
  assert.equal(next(design, { kind: 'advance' }).kind, 'recovery');
  const review = next(design, { kind: 'advance', revision: 'old', material }).state;
  const pending = connect(next(review, ask).state);
  const changed = next(pending, { kind: 'review-revision', revision: 'new', material }).state;
  assert.equal(changed.occurrence, review.occurrence + 1);
  const replacement = connect(next(changed, ask).state);
  assert.deepEqual(next(replacement, answer(pending.pending.instance, '2', 'old')).state, replacement);
  assert.equal(next(replacement, answer(replacement.pending.instance, '2', 'new')).state.node, 'complete');
});

test('changing design material invalidates approval even if its revision label is reused', () => {
  const review = { ...initial, node: 'review', revision: 'r1', material, work: quickWork };
  const seen = connect(next(review, ask).state);
  const changed = next(seen, { kind: 'review-revision', revision: 'r1', material: 'A different design' }).state;
  assert.equal(changed.material, 'A different design');
  const replacement = connect(next(changed, ask).state);
  assert.notEqual(replacement.pending.instance, seen.pending.instance);
  assert.deepEqual(next(replacement, answer(seen.pending.instance, '2', 'r1')).state, replacement);
  const approved = next(replacement, answer(replacement.pending.instance, '2', 'r1')).state;
  assert.equal(approved.node, 'complete');
  assert.equal(next({ ...approved, material }).kind, 'recovery');
});

test('custom answers remain available without choosing a workflow path', () => {
  const pending = connect(next(initial, ask).state);
  const other = next(pending, answer(pending.pending.instance, '3'));
  assert.equal(other.kind, 'needs-custom');
  const custom = next(other.state, answer(pending.pending.instance, '  another idea  '));
  assert.equal(custom.kind, 'needs-clarification');
  assert.equal(custom.custom, '  another idea  ');
  assert.equal(custom.state.node, 'context');
  assert.equal(next(custom.state).custom, '  another idea  ');
  assert.deepEqual(next(custom.state, answer(pending.pending.instance, '1')).state, custom.state);
  const retried = next(custom.state, { kind: 'retry' });
  assert.equal(retried.state.phase, 'active');
  const fresh = connect(next(retried.state, ask).state);
  assert.notEqual(fresh.pending.instance, pending.pending.instance);
  assert.equal(next(fresh, answer(fresh.pending.instance, '1')).state.node, 'conversation');
});

test('restored pending decisions must match the session, revision, and displayed options', () => {
  const review = { session: 's', occurrence: 3, node: 'review', phase: 'active', revision: 'r1', material, work: quickWork };
  const waiting = connect(next(review, ask).state);
  const wrongRevision = { ...waiting, revision: 'r2' };
  assert.equal(next(wrongRevision, answer(waiting.pending.instance, '2', 'r2')).kind, 'recovery');
  const wrongOrder = { ...waiting, pending: { ...waiting.pending, displayedKeys: [...waiting.pending.displayedKeys].reverse() } };
  assert.equal(next(wrongOrder).kind, 'recovery');
  const wrongNode = { ...waiting, node: 'sizing' };
  assert.equal(next(wrongNode).kind, 'recovery');
  const shortenedQuestion = { ...waiting.pending.question, options: waiting.pending.question.options.slice(0, 1) };
  const truncated = { ...waiting, pending: { ...waiting.pending, question: shortenedQuestion, continuation: { ...waiting.pending.continuation, question: shortenedQuestion } } };
  assert.equal(next(truncated).kind, 'recovery');
});

test('a single-direction transition to review cannot skip the revision precondition', () => {
  const design = { ...initial, node: 'design', work: quickWork };
  assert.equal(next(design, ask).kind, 'invalid-event');
  assert.equal(next(design, { kind: 'advance' }).kind, 'recovery');
  assert.equal(next(design, { kind: 'advance', revision: 'r1', material }).state.revision, 'r1');
});

test('explicit facts select one valid direction and conflicting facts recover', () => {
  const clear = next(initial, { kind: 'facts', facts: { clear: true, discuss: false }, context: 'Fix a typo' });
  assert.equal(clear.state.node, 'design');
  assert.equal(clear.guidance.context, 'Fix a typo');
  assert.equal(next(initial, { kind: 'facts', facts: { clear: true, discuss: true } }).kind, 'recovery');
  assert.equal(next(initial, { kind: 'facts', facts: {} }).kind, 'recovery');
  const sizing = { ...initial, node: 'sizing' };
  assert.equal(next(sizing, { kind: 'facts', facts: { small: false, design: true } }).state.node, 'design');
});

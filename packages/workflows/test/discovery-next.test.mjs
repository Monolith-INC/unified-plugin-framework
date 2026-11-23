import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDiscovery } from '../dist/discovery-next.js';

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
  const review = { session: 's', occurrence: 3, node: 'review', phase: 'active', revision: 'r1' };
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
  const design = { ...initial, node: 'design' };
  assert.deepEqual(next(design).state, design);
  assert.equal(next(design, { kind: 'advance' }).kind, 'recovery');
  const review = next(design, { kind: 'advance', revision: 'old' }).state;
  const pending = connect(next(review, ask).state);
  const changed = next(pending, { kind: 'review-revision', revision: 'new' }).state;
  assert.equal(changed.occurrence, review.occurrence + 1);
  const replacement = connect(next(changed, ask).state);
  assert.deepEqual(next(replacement, answer(pending.pending.instance, '2', 'old')).state, replacement);
  assert.equal(next(replacement, answer(replacement.pending.instance, '2', 'new')).state.node, 'complete');
});

test('custom answers remain available without choosing a workflow path', () => {
  const pending = connect(next(initial, ask).state);
  const other = next(pending, answer(pending.pending.instance, '3'));
  const custom = next(other.state, answer(pending.pending.instance, '  another idea  '));
  assert.equal(custom.kind, 'needs-clarification');
  assert.equal(custom.custom, '  another idea  ');
  assert.equal(custom.state.node, 'context');
});

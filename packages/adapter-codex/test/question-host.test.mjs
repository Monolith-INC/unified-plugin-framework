import assert from 'node:assert/strict';
import test from 'node:test';
import { codexQuestionPort, createCodexDiscoveryHandler } from '../dist/question-host.js';

const state = { session: 'discovery-session', occurrence: 0, node: 'context', phase: 'active' };
const signal = new AbortController().signal;
const answer = (choice) => ({ action: 'accept', content: { choice } });

test('a form response reaches the existing continuation once, including concurrent submission', async () => {
  const gate = Promise.withResolvers();
  const requests = [];
  const handle = createCodexDiscoveryHandler(codexQuestionPort((form) => {
    requests.push(form);
    return gate.promise;
  }));
  const first = handle(state, true, signal);
  const concurrent = await handle(state, true, signal);
  assert.equal(concurrent.kind, 'ignored');
  const choices = requests[0].requestedSchema.properties.choice.oneOf;
  assert.ok(choices.some(({ const: id, title }) => id === 'choice:conversation' && title !== id));
  gate.resolve(answer('choice:conversation'));
  assert.equal((await first).state.node, 'conversation');
  assert.equal((await handle(state, true, signal)).kind, 'ignored');
  assert.equal(requests.length, 1);
});

test('invalid, dismissed, and cancelled responses leave the same decision pending', async () => {
  const responses = [
    answer('conversation'), { action: 'decline' }, { action: 'cancel' }, answer('choice:conversation'),
  ];
  const handle = createCodexDiscoveryHandler(codexQuestionPort(async () => responses.shift()));
  for (const expected of ['host-unavailable', 'dismissed', 'dismissed']) {
    const result = await handle(state, true, signal);
    assert.equal(result.kind, expected);
    assert.equal(result.state.phase, 'waiting');
    assert.equal(result.state.node, 'context');
  }
  assert.equal((await handle(state, true, signal)).state.node, 'conversation');
});

test('custom text is collected separately and stays literal even when it resembles an option ID', async () => {
  const value = '  choice:conversation  ';
  const replies = [answer('custom'), { action: 'accept', content: { answer: value } }];
  const handle = createCodexDiscoveryHandler(codexQuestionPort(async () => replies.shift()));
  const result = await handle(state, true, signal);
  assert.equal(result.kind, 'needs-clarification');
  assert.equal(result.custom, value);
  assert.equal(result.state.node, 'context');
});

test('an unavailable client uses the shared text fallback without sending a form', async () => {
  const handle = createCodexDiscoveryHandler(codexQuestionPort(() => assert.fail('no native request expected')));
  const result = await handle(state, false, signal);
  assert.equal(result.kind, 'waiting');
  assert.equal(result.state.pending.kind, 'text');
});

test('a late reply after cancellation does not advance or consume the decision', async () => {
  const abort = new AbortController();
  const gate = Promise.withResolvers();
  const handle = createCodexDiscoveryHandler(codexQuestionPort(() => gate.promise));
  const call = handle(state, true, abort.signal);
  abort.abort();
  gate.resolve(answer('choice:conversation'));
  const result = await call;
  assert.equal(result.kind, 'host-unavailable');
  assert.equal(result.state.node, 'context');
  assert.equal((await handle(state, true, signal)).state.node, 'conversation');
});

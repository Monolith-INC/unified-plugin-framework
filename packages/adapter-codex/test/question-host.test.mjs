import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { codexQuestionPort, createCodexDiscoveryHandler, serveCodexQuestions } from '../dist/question-host.js';

const quickWork = { mode: 'discover-quick', selected: [], results: [{ step: 'brainstorming', status: 'completed', evidence: 'The user selected a date without a time.' }] };
const material = '[Due dates design](docs/due-dates.md)';
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
  const completed = await first;
  assert.equal(completed.state.node, 'conversation');
  assert.deepEqual(await handle(state, true, signal), completed);
  assert.equal(requests.length, 1);
});

test('invalid, dismissed, and cancelled responses leave the same decision pending', async () => {
  const responses = [
    answer('conversation'), { action: 'decline' }, { action: 'cancel' }, answer('choice:conversation'),
  ];
  const handle = createCodexDiscoveryHandler(codexQuestionPort(async () => responses.shift()));
  for (const [occurrence, expected] of ['host-unavailable', 'dismissed', 'dismissed'].entries()) {
    const result = await handle({ ...state, occurrence }, true, signal);
    assert.equal(result.kind, expected);
    assert.equal(result.state.phase, 'waiting');
    assert.equal(result.state.node, 'context');
    assert.equal(result.state.occurrence, occurrence + 1);
    assert.equal(result.state.pending.kind, 'text');
  }
  assert.equal((await handle({ ...state, occurrence: 3 }, true, signal)).state.node, 'conversation');
});

test('custom text is collected separately and stays literal even when it resembles an option ID', async () => {
  const value = '  choice:conversation  ';
  const replies = [answer('custom'), { action: 'accept', content: { answer: value } }];
  const handle = createCodexDiscoveryHandler(codexQuestionPort(async () => replies.shift()));
  const result = await handle(state, true, signal);
  assert.equal(result.kind, 'needs-clarification');
  assert.equal(result.custom, value);
  assert.equal(result.state.node, 'context');
  assert.deepEqual(await handle(state, true, signal), result);
  assert.equal(replies.length, 0);
});

test('an unavailable client uses the shared text fallback without sending a form', async () => {
  const handle = createCodexDiscoveryHandler(codexQuestionPort(() => assert.fail('no native request expected')));
  const result = await handle(state, false, signal);
  assert.equal(result.kind, 'waiting');
  assert.equal(result.state.pending.kind, 'text');
  assert.equal(result.recoveryUnit, '3-mechanics/question-unavailable');
});

test('a late reply after cancellation does not advance or consume the decision', async () => {
  const abort = new AbortController();
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  const handle = createCodexDiscoveryHandler(codexQuestionPort(() => {
    started.resolve();
    return gate.promise;
  }));
  const call = handle(state, true, abort.signal);
  await started.promise;
  abort.abort();
  const result = await call;
  assert.equal(result.kind, 'host-unavailable');
  assert.equal(result.reason, 'disconnect');
  assert.equal(result.state.node, 'context');
  assert.equal(result.state.pending.kind, 'text');
  gate.resolve(answer('choice:conversation'));
  assert.deepEqual(await handle(state, true, signal), result);
});

test('a stalled native form times out without blocking a different decision', async () => {
  const started = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const handle = createCodexDiscoveryHandler({
    ask: (pending) => async () => pending.instance.includes('independent')
      ? { channel: 'native', instance: pending.instance, keys: ['conversation'] }
      : (started.resolve(), gate.promise),
  }, 40);
  const waiting = handle(state, true, signal, false);
  await started.promise;
  assert.equal((await handle({ ...state, session: 'independent' }, true, signal)).state.node, 'conversation');
  const result = await waiting;
  assert.equal(result.reason, 'timeout');
  assert.equal(result.recoveryUnit, '3-mechanics/question-timeout');
  assert.equal(result.state.pending.kind, 'needs-input');
  gate.resolve({ channel: 'native', instance: JSON.stringify([state.session, 0, null]), keys: ['conversation'] });
  assert.deepEqual(await handle(state, true, signal), result);
});

test('a host error returns a usable text decision', async () => {
  const handle = createCodexDiscoveryHandler(codexQuestionPort(async () => { throw new Error('fixture'); }));
  const result = await handle(state, true, signal);
  assert.equal(result.reason, 'unavailable');
  assert.equal(result.recoveryUnit, '3-mechanics/question-unavailable');
  assert.equal(result.state.pending.kind, 'text');
});

test('a newer review revision replaces a form before its answer arrives', async () => {
  const oldAnswer = Promise.withResolvers();
  const oldStarted = Promise.withResolvers();
  let firstForm = true;
  const review = { ...state, node: 'review', revision: 'old', material, work: quickWork };
  const handle = createCodexDiscoveryHandler(codexQuestionPort((_form, formSignal) => {
    if (firstForm) {
      firstForm = false;
      oldStarted.resolve(formSignal);
      return oldAnswer.promise;
    }
    return Promise.resolve(answer('choice:complete'));
  }));
  const oldCall = handle(review, true, signal);
  const oldSignal = await oldStarted.promise;
  const revised = { ...review, occurrence: 1, revision: 'new' };
  const completed = await handle(revised, true, signal);
  assert.equal(oldSignal.aborted, true);
  oldAnswer.resolve(answer('choice:complete'));
  assert.equal((await oldCall).kind, 'ignored');
  assert.equal((await handle(review, true, signal)).kind, 'ignored');
  assert.equal(completed.kind, 'ready');
  assert.equal(completed.state.node, 'complete');
  assert.deepEqual(await handle(revised, true, signal), completed);
  assert.equal((await handle({ ...revised, work: { ...revised.work, results: [] } }, true, signal)).kind, 'recovery');
  assert.equal((await handle({ ...revised, material: 'A different design' }, true, signal)).kind, 'ignored');
});

test('the MCP tool carries localized discovery and custom form wording', async (t) => {
  const client = new Client({ name: 'localized-discovery-test', version: '1.0.0' }, {
    capabilities: { elicitation: { form: {} } },
  });
  const formMessages = [];
  client.setRequestHandler(ElicitRequestSchema, ({ params }) => {
    formMessages.push(params);
    return params.requestedSchema.properties.choice
      ? answer('custom') : { action: 'accept', content: { answer: '  Outra direção  ' } };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = serveCodexQuestions(
    (input) => input?.session === state.session,
    (input) => typeof input?.explanation === 'string',
    undefined, serverTransport,
  );
  t.after(async () => {
    await client.close();
    await server;
  });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const tool = tools.find(({ name }) => name === 'upf_discovery_question');
  assert.ok(tool);
  const result = await client.callTool({ name: tool.name, arguments: {
    state, language: 'pt-BR', wording: {
      explanation: 'Como quer seguir?',
      labels: { design: 'Prosseguir', conversation: 'Conversar' },
    },
  } });
  assert.equal(formMessages[0].message, 'Como quer seguir?');
  const choice = formMessages[0].requestedSchema.properties.choice;
  assert.equal(choice.title, 'Resposta');
  assert.deepEqual(choice.oneOf, [
    { const: 'choice:conversation', title: 'Conversar' },
    { const: 'choice:design', title: 'Prosseguir' },
    { const: 'custom', title: 'Outra opção' },
  ]);
  assert.equal(formMessages[1].message, 'Digite sua resposta.');
  assert.equal(formMessages[1].requestedSchema.properties.answer.title, 'Sua resposta');
  const continuation = JSON.parse(result.content[0].text);
  assert.equal(continuation.kind, 'needs-clarification');
  assert.equal(continuation.custom, '  Outra direção  ');
});

test('a changed revision invalidates the open approval while review evidence is missing', async () => {
  const handleStarted = Promise.withResolvers();
  const oldReply = Promise.withResolvers();
  const work = { ...quickWork, selected: ['bmad-review:verification-gap'], results: [...quickWork.results,
    { step: 'bmad-review:verification-gap', status: 'completed', evidence: 'No gaps found', revision: 'r1', material }] };
  const review = { ...state, node: 'review', revision: 'r1', work, material };
  const handle = createCodexDiscoveryHandler(codexQuestionPort((form) => {
    handleStarted.resolve(form);
    return oldReply.promise;
  }));
  const pending = handle(review, true, signal);
  assert.ok((await handleStarted.promise).message.startsWith(material));
  const changed = { ...review, occurrence: 1, revision: 'r2', material: 'New due date design' };
  assert.equal((await handle(changed, true, signal)).kind, 'recovery');
  oldReply.resolve(answer('choice:complete'));
  assert.equal((await pending).kind, 'ignored');
});

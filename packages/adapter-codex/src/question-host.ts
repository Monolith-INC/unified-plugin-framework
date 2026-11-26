import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, ListToolsRequestSchema, type ElicitRequestFormParams, type ElicitResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  nextDiscovery, type DiscoveryState, type DiscoveryWaiting, type NativeQuestionPort, type QuestionResponse,
} from '@agent-plugins/workflows';

type Elicit = (form: ElicitRequestFormParams, signal: AbortSignal) => Promise<ElicitResult>;
type Pending = DiscoveryWaiting['pending'];
type NativeResponse = Extract<QuestionResponse, { readonly keys: readonly string[] }>;
const nativeCapabilities = {
  native: { single: true, several: false, consent: false, custom: true }, canvas: null, reply: true,
};
const defaultTimeoutMs = 60_000;
const toolName = 'upf_discovery_question';
const other = 'custom';
const optionId = (key: string): string => `choice:${key}`;
const selected = (pending: Pending, keys: readonly string[], custom?: string): NativeResponse => ({
  instance: pending.instance, channel: 'native', keys, ...(custom === undefined ? {} : { custom }),
});
const dismissed = (pending: Pending): QuestionResponse => ({ instance: pending.instance, channel: 'dismissed' });

const choiceForm = (pending: Pending, options: readonly { readonly key?: string; readonly label: string }[]): ElicitRequestFormParams => ({
  mode: 'form', message: pending.question.explanation,
  requestedSchema: {
    type: 'object',
    properties: {
      choice: {
        type: 'string', title: 'Answer', oneOf: [
          ...pending.displayedKeys.map((key) => ({ const: optionId(key), title: options.find((option) => option.key === key)?.label ?? key })),
          { const: other, title: 'Other' },
        ],
      },
    },
    required: ['choice'],
  },
});
const customForm: ElicitRequestFormParams = {
  mode: 'form', message: 'Enter your answer.',
  requestedSchema: {
    type: 'object', properties: { answer: { type: 'string', title: 'Your answer' } }, required: ['answer'],
  },
};
const customAnswer = (pending: Pending, response: ElicitResult): QuestionResponse | null => {
  const answer = response.content?.['answer'];
  return response.action !== 'accept' ? dismissed(pending)
    : typeof answer === 'string' && answer.trim() !== '' ? selected(pending, [], answer) : null;
};
const choiceAnswer = (pending: Pending, response: ElicitResult): QuestionResponse | null => {
  const key = pending.displayedKeys.find((item) => optionId(item) === response.content?.['choice']);
  return response.action !== 'accept' ? dismissed(pending) : key === undefined ? null : selected(pending, [key]);
};
const askSingle = async (elicit: Elicit, pending: Pending, signal: AbortSignal): Promise<QuestionResponse | null> => {
  switch (pending.question.kind) {
    case 'single': {
      const reply = await elicit(choiceForm(pending, pending.question.options), signal);
      return reply.action === 'accept' && reply.content?.['choice'] === other && !signal.aborted
        ? customAnswer(pending, await elicit(customForm, signal)) : choiceAnswer(pending, reply);
    }
    default: return null;
  }
};

/** Codex receives the answer to the exact form requested by this server. */
export const codexQuestionPort = (elicit: Elicit): NativeQuestionPort => ({
  ask: (pending, signal) => () => askSingle(elicit, pending, signal).catch(() => null),
});

const prepare = (state: DiscoveryState, available: boolean, reply: boolean) => {
  const capabilities = { native: available ? nativeCapabilities.native : null, canvas: null, reply };
  switch (state.phase) {
    case 'active': return nextDiscovery(state, { kind: 'ask', capabilities });
    case 'waiting': return state.pending.kind === 'needs-input'
      ? nextDiscovery(state, { kind: 'connect', capabilities }) : nextDiscovery(state);
    case 'paused': return nextDiscovery(state);
  }
};
const continueDecision = (state: DiscoveryWaiting, response: QuestionResponse) =>
  nextDiscovery(state, { kind: 'answer', response, ...(state.revision === undefined ? {} : { revision: state.revision }) });

type Interruption = 'timeout' | 'disconnect' | 'dismissed' | 'unavailable';
const recover = (waiting: DiscoveryWaiting, reason: Interruption, reply: boolean) => ({
  kind: reason === 'dismissed' ? 'dismissed' as const : 'host-unavailable' as const,
  reason,
  state: nextDiscovery(waiting, { kind: 'recover-input', instance: waiting.pending.instance, reply }).state,
});
type Recovery = ReturnType<typeof recover>;
type Attempt = { readonly response: QuestionResponse | null } | { readonly interrupted: 'timeout' | 'disconnect' };

const receive = (port: NativeQuestionPort, pending: Pending, caller: AbortSignal, timeoutMs: number): Promise<Attempt> => {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = AbortSignal.any([caller, deadline.signal]);
  const interruption = (): Attempt => ({ interrupted: caller.aborted ? 'disconnect' : 'timeout' });
  const cancelled = new Promise<Attempt>((resolve) => {
    const onAbort = () => resolve(interruption());
    if (signal.aborted) onAbort();
    if (!signal.aborted) signal.addEventListener('abort', onAbort, { once: true });
  });
  const response = Promise.resolve().then(() => signal.aborted ? null : port.ask(pending, signal)())
    .then((value): Attempt => signal.aborted ? interruption() : { response: value }, (): Attempt => ({ response: null }));
  return Promise.race([cancelled, response]).finally(() => {
    clearTimeout(timer);
    deadline.abort();
  });
};

/** One connection owns in-flight and consumed occurrences. A restart is a separate connection. */
export const createCodexDiscoveryHandler = (port: NativeQuestionPort, timeoutMs = defaultTimeoutMs) => {
  // Mutable connection bookkeeping is confined to this I/O boundary. Reserve before awaiting the host.
  const inFlight = new Set<string>();
  const settled = new Map<string, { readonly occurrence: number; readonly node: string; readonly revision?: string; readonly recovery?: Recovery }>();
  const ask = async (state: Exclude<DiscoveryState, { readonly phase: 'paused' }>, available: boolean, signal: AbortSignal, reply: boolean) => {
    const previous = settled.get(state.session);
    if (state.occurrence === previous?.occurrence && state.node === previous.node &&
        state.revision === previous.revision && previous.recovery !== undefined) return previous.recovery;
    if (inFlight.has(state.session) || state.occurrence <= (previous?.occurrence ?? -1)) return { kind: 'ignored', state };
    const prepared = prepare(state, available, reply);
    if (prepared.kind !== 'waiting' || prepared.state.phase !== 'waiting' || prepared.state.pending.kind !== 'native') return prepared;
    const waiting = prepared.state;
    const { session, occurrence, pending } = waiting;
    const identity = { occurrence, node: waiting.node, ...(waiting.revision === undefined ? {} : { revision: waiting.revision }) };
    const interrupted = (reason: Interruption): Recovery => {
      const recovery = recover(waiting, reason, reply);
      settled.set(session, { ...identity, recovery });
      return recovery;
    };
    switch (true) {
      case signal.aborted: return interrupted('disconnect');
      case !available: return interrupted('unavailable');
      default: {
        inFlight.add(session);
        return receive(port, pending, signal, timeoutMs).then((attempt) => {
          if ('interrupted' in attempt) return interrupted(attempt.interrupted);
          if (attempt.response === null) return interrupted('unavailable');
          if (attempt.response.channel === 'dismissed') return interrupted('dismissed');
          const result = continueDecision(waiting, attempt.response);
          if (result.kind === 'ready' || result.kind === 'needs-clarification') settled.set(session, identity);
          return result;
        }).finally(() => inFlight.delete(session));
      }
    }
  };
  return async (state: DiscoveryState, available: boolean, signal: AbortSignal, reply = true) =>
    state.phase === 'paused' ? nextDiscovery(state) : ask(state, available, signal, reply);
};

const tool = {
  name: toolName, description: 'Ask a pending UPF discovery question and return the resulting workflow state.',
  inputSchema: { type: 'object' as const, properties: { state: { type: 'object' }, reply: { type: 'boolean' } }, required: ['state'] },
};
const content = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

/** Serve the Codex-specific transport on stdio. The CLI supplies the shared state decoder. */
export const serveCodexQuestions = async (isDiscoveryState: (value: unknown) => value is DiscoveryState): Promise<number> => {
  const server = new Server({ name: 'upf-codex-questions', version: '0.1.0' }, { capabilities: { tools: {} } });
  const handle = createCodexDiscoveryHandler(codexQuestionPort((form, signal) => server.elicitInput(form, { signal })));
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [tool] }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, { signal }) => {
    const state = params.arguments?.['state'];
    const reply = params.arguments?.['reply'];
    return params.name === toolName && isDiscoveryState(state) && (reply === undefined || typeof reply === 'boolean')
      ? content(await handle(state, server.getClientCapabilities()?.elicitation?.form !== undefined, signal, reply))
      : { ...content({ kind: 'invalid-input' }), isError: true };
  });
  const closed = new Promise<number>((resolve) => { server.onclose = () => resolve(0); });
  await server.connect(new StdioServerTransport());
  return closed;
};

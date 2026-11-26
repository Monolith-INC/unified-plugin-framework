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
const unavailableCapabilities = { native: null, canvas: null, reply: true };
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

const prepare = (state: DiscoveryState, available: boolean) => {
  const capabilities = available ? nativeCapabilities : unavailableCapabilities;
  switch (state.phase) {
    case 'active': return nextDiscovery(state, { kind: 'ask', capabilities });
    case 'waiting': return state.pending.kind === 'needs-input'
      ? nextDiscovery(state, { kind: 'connect', capabilities }) : nextDiscovery(state);
    case 'paused': return nextDiscovery(state);
  }
};
const continueDecision = (state: DiscoveryWaiting, response: QuestionResponse) =>
  nextDiscovery(state, { kind: 'answer', response, ...(state.revision === undefined ? {} : { revision: state.revision }) });

/** One connection owns in-flight and consumed occurrences. A restart is a separate connection. */
export const createCodexDiscoveryHandler = (port: NativeQuestionPort) => {
  // Mutable connection bookkeeping is confined to this I/O boundary. Reserve before awaiting the host.
  const inFlight = new Set<string>();
  const consumed = new Map<string, number>();
  return async (state: DiscoveryState, available: boolean, signal: AbortSignal) => {
    const prepared = prepare(state, available);
    if (prepared.kind !== 'waiting' || prepared.state.phase !== 'waiting' || prepared.state.pending.kind !== 'native') return prepared;
    const waiting = prepared.state;
    const { session, occurrence, pending } = waiting;
    switch (true) {
      case !available || signal.aborted: return { kind: 'host-unavailable', state: waiting };
      case inFlight.has(session) || occurrence <= (consumed.get(session) ?? -1):
        return { kind: 'ignored', state: waiting };
      default: {
        inFlight.add(session);
        return port.ask(pending, signal)().then((response) => {
          if (signal.aborted || response === null) return { kind: 'host-unavailable', state: waiting };
          switch (response.channel) {
            case 'dismissed': return { kind: 'dismissed', state: waiting };
            default: {
              const result = continueDecision(waiting, response);
              if (result.kind === 'ready' || result.kind === 'needs-clarification') consumed.set(session, occurrence);
              return result;
            }
          }
        }).finally(() => inFlight.delete(session));
      }
    }
  };
};

const tool = {
  name: toolName, description: 'Ask a pending UPF discovery question and return the resulting workflow state.',
  inputSchema: { type: 'object' as const, properties: { state: { type: 'object' } }, required: ['state'] },
};
const content = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

/** Serve the Codex-specific transport on stdio. The CLI supplies the shared state decoder. */
export const serveCodexQuestions = async (isDiscoveryState: (value: unknown) => value is DiscoveryState): Promise<number> => {
  const server = new Server({ name: 'upf-codex-questions', version: '0.1.0' }, { capabilities: { tools: {} } });
  const handle = createCodexDiscoveryHandler(codexQuestionPort((form, signal) => server.elicitInput(form, { signal })));
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [tool] }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, { signal }) => {
    const state = params.arguments?.['state'];
    return params.name === toolName && isDiscoveryState(state)
      ? content(await handle(state, server.getClientCapabilities()?.elicitation?.form !== undefined, signal))
      : { ...content({ kind: 'invalid-input' }), isError: true };
  });
  const closed = new Promise<number>((resolve) => { server.onclose = () => resolve(0); });
  await server.connect(new StdioServerTransport());
  return closed;
};

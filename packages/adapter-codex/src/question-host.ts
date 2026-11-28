import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, ListToolsRequestSchema, type ElicitRequestFormParams, type ElicitResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  nextDiscovery, questionRecoveryUnit, type DiscoveryState, type DiscoveryWaiting, type NativeQuestionPort,
  type DiscoveryNext, type QuestionInterruption, type QuestionRecoveryLookup, type QuestionResponse, type QuestionWording,
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
type FormLabels = Readonly<{ answer: string; other: string; customPrompt: string; customAnswer: string }>;
type Presentation = Readonly<{ language?: string; wording?: QuestionWording; controls?: FormLabels }>;
const english: FormLabels = { answer: 'Answer', other: 'Other', customPrompt: 'Enter your answer.', customAnswer: 'Your answer' };
const portuguese: FormLabels = { answer: 'Resposta', other: 'Outra opção', customPrompt: 'Digite sua resposta.', customAnswer: 'Sua resposta' };
const formLabels = ({ language = 'en', controls }: Presentation): FormLabels | undefined => {
  switch (language.trim().toLowerCase().split('-')[0]) {
    case 'en': return controls ?? english;
    case 'pt': return controls ?? portuguese;
    default: return controls;
  }
};

const optionId = (key: string): string => `choice:${key}`;
const selected = (pending: Pending, keys: readonly string[], custom?: string): NativeResponse => ({
  instance: pending.instance, channel: 'native', keys, ...(custom === undefined ? {} : { custom }),
});
const dismissed = (pending: Pending): QuestionResponse => ({ instance: pending.instance, channel: 'dismissed' });

const choiceForm = (pending: Pending, labels: FormLabels, options: readonly { readonly key?: string; readonly label: string }[]): ElicitRequestFormParams => ({
  mode: 'form', message: pending.question.explanation,
  requestedSchema: {
    type: 'object',
    properties: {
      choice: {
        type: 'string', title: labels.answer, oneOf: [
          ...pending.displayedKeys.map((key) => ({ const: optionId(key), title: options.find((option) => option.key === key)?.label ?? key })),
          { const: other, title: labels.other },
        ],
      },
    },
    required: ['choice'],
  },
});
const customForm = (labels: FormLabels): ElicitRequestFormParams => ({
  mode: 'form', message: labels.customPrompt,
  requestedSchema: {
    type: 'object', properties: { answer: { type: 'string', title: labels.customAnswer } }, required: ['answer'],
  },
});
const customAnswer = (pending: Pending, response: ElicitResult): QuestionResponse | null => {
  const answer = response.content?.['answer'];
  return response.action !== 'accept' ? dismissed(pending)
    : typeof answer === 'string' && answer.trim() !== '' ? selected(pending, [], answer) : null;
};
const choiceAnswer = (pending: Pending, response: ElicitResult): QuestionResponse | null => {
  const key = pending.displayedKeys.find((item) => optionId(item) === response.content?.['choice']);
  return response.action !== 'accept' ? dismissed(pending) : key === undefined ? null : selected(pending, [key]);
};
const askSingle = async (elicit: Elicit, pending: Pending, signal: AbortSignal, labels: FormLabels): Promise<QuestionResponse | null> => {
  switch (pending.question.kind) {
    case 'single': {
      const reply = await elicit(choiceForm(pending, labels, pending.question.options), signal);
      return reply.action === 'accept' && reply.content?.['choice'] === other && !signal.aborted
        ? customAnswer(pending, await elicit(customForm(labels), signal)) : choiceAnswer(pending, reply);
    }
    default: return null;
  }
};

/** Codex receives the answer to the exact form requested by this server. */
export const codexQuestionPort = (elicit: Elicit, labels = english): NativeQuestionPort => ({
  ask: (pending, signal) => () => askSingle(elicit, pending, signal, labels).catch(() => null),
});

const prepare = (state: DiscoveryState, available: boolean, reply: boolean, presentation: Presentation) => {
  const capabilities = { native: available ? nativeCapabilities.native : null, canvas: null, reply };
  switch (state.phase) {
    case 'active': return nextDiscovery(state, { kind: 'ask', capabilities, ...(presentation.language === undefined ? {} : { language: presentation.language }),
      ...(presentation.wording === undefined ? {} : { wording: presentation.wording }) });
    case 'waiting': return state.pending.kind === 'needs-input'
      ? nextDiscovery(state, { kind: 'connect', capabilities }) : nextDiscovery(state);
    case 'paused': return nextDiscovery(state);
  }
};
const continueDecision = (state: DiscoveryWaiting, response: QuestionResponse) =>
  nextDiscovery(state, { kind: 'answer', response, ...(state.revision === undefined ? {} : { revision: state.revision }) });

const recover = (waiting: DiscoveryWaiting, reason: QuestionInterruption, reply: boolean) => ({
  kind: reason === 'dismissed' ? 'dismissed' as const : 'host-unavailable' as const,
  reason,
  recoveryUnit: questionRecoveryUnit(reason),
  state: nextDiscovery(waiting, { kind: 'recover-input', instance: waiting.pending.instance, reply }).state,
});
type Recovery = ReturnType<typeof recover>;
type DecisionState = Exclude<DiscoveryState, { readonly phase: 'paused' }>;
type Identity = Pick<DecisionState, 'occurrence' | 'node' | 'revision' | 'material'>;
type Recorded = { readonly identity: Identity; readonly result?: DiscoveryNext | Recovery };
type Active = { readonly occurrence: number; readonly controller: AbortController };
const sameIdentity = (a: Identity, b: Identity): boolean =>
  a.occurrence === b.occurrence && a.node === b.node && a.revision === b.revision && a.material === b.material;
const ignored = (state: DecisionState) => ({ kind: 'ignored' as const, state });
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
  const inFlight = new Map<string, Active>();
  const settled = new Map<string, Recorded>();
  const ask = async (state: DecisionState, available: boolean, signal: AbortSignal, reply: boolean,
    presentation: Presentation, nativePort: NativeQuestionPort) => {
    const { session, occurrence, node, revision, material } = state;
    const identity = { occurrence, node, ...(revision === undefined ? {} : { revision }),
      ...(material === undefined ? {} : { material }) };
    const current = inFlight.get(session);
    const previous = settled.get(session);
    if (occurrence <= (current?.occurrence ?? -1)) return ignored(state);
    if (previous !== undefined && occurrence <= previous.identity.occurrence) {
      if (!sameIdentity(identity, previous.identity)) return ignored(state);
      if (previous.result !== undefined) {
        const currentDecision = prepare(state, available, reply, presentation);
        return currentDecision.kind === 'recovery' || currentDecision.kind === 'invalid-event' ? currentDecision : previous.result;
      }
    }
    const prepared = prepare(state, available, reply, presentation);
    if (current !== undefined) {
      inFlight.delete(session);
      current.controller.abort();
    }
    settled.set(session, { identity });
    if (prepared.kind === 'recovery' || prepared.kind === 'invalid-event') return prepared;
    const remember = <T extends DiscoveryNext | Recovery>(result: T): T => {
      settled.set(session, { identity, result });
      return result;
    };
    if (prepared.kind !== 'waiting' || prepared.state.phase !== 'waiting' || prepared.state.pending.kind !== 'native') {
      const result = !available && state.phase === 'active' && (prepared.kind === 'waiting' || prepared.kind === 'needs-input')
        ? { ...prepared, recoveryUnit: questionRecoveryUnit('unavailable') } : prepared;
      return result;
    }
    const waiting = prepared.state;
    const interrupted = (reason: QuestionInterruption): Recovery => remember(recover(waiting, reason, reply));
    if (signal.aborted) return interrupted('disconnect');
    if (!available) return interrupted('unavailable');

    const attempt = { occurrence, controller: new AbortController() };
    inFlight.set(session, attempt);
    const cancellation = AbortSignal.any([signal, attempt.controller.signal]);
    return receive(nativePort, waiting.pending, cancellation, timeoutMs).then((event) => {
      if (inFlight.get(session) !== attempt) return ignored(state);
      if ('interrupted' in event) return interrupted(event.interrupted);
      if (event.response === null) return interrupted('unavailable');
      if (event.response.channel === 'dismissed') return interrupted('dismissed');
      const result = continueDecision(waiting, event.response);
      return result.kind === 'ready' || result.kind === 'needs-clarification' ? remember(result) : result;
    }).finally(() => {
      if (inFlight.get(session) === attempt) inFlight.delete(session);
    });
  };
  return async (state: DiscoveryState, available: boolean, signal: AbortSignal, reply = true,
    presentation: Presentation = {}, nativePort = port) =>
    state.phase === 'paused' ? nextDiscovery(state) : ask(state, available, signal, reply, presentation, nativePort);
};

const tool = {
  name: toolName, description: 'Ask a pending UPF discovery question and return the resulting workflow state.',
  inputSchema: {
    type: 'object' as const, required: ['state'],
    properties: {
      state: { type: 'object' }, reply: { type: 'boolean' }, language: { type: 'string', description: 'Project language as a BCP 47 tag, for example en or pt-BR.' },
      wording: {
        type: 'object', required: ['explanation', 'labels'],
        properties: { explanation: { type: 'string' }, labels: { type: 'object', additionalProperties: { type: 'string' } } },
      },
      controls: {
        type: 'object', required: ['answer', 'other', 'customPrompt', 'customAnswer'],
        properties: { answer: { type: 'string' }, other: { type: 'string' }, customPrompt: { type: 'string' }, customAnswer: { type: 'string' } },
      },
    },
  },
};
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const formControls = (value: unknown): value is FormLabels => typeof value === 'object' && value !== null
  && 'answer' in value && nonempty(value.answer) && 'other' in value && nonempty(value.other)
  && 'customPrompt' in value && nonempty(value.customPrompt) && 'customAnswer' in value && nonempty(value.customAnswer);
const content = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

type QuestionResult = Awaited<ReturnType<ReturnType<typeof createCodexDiscoveryHandler>>>;
const withKnowledge = async (result: QuestionResult, lookup?: QuestionRecoveryLookup) => {
  if (lookup === undefined || !('recoveryUnit' in result) || result.recoveryUnit === undefined) return result;
  const guidance = await lookup(result.recoveryUnit)().catch(() => null);
  return guidance === null ? result : { ...result, recoveryGuidance: guidance };
};

/** Serve the Codex-specific transport on stdio. The CLI supplies the shared state decoder. */
export const serveCodexQuestions = async (isDiscoveryState: (value: unknown) => value is DiscoveryState,
  isQuestionWording: (value: unknown) => value is QuestionWording, lookup?: QuestionRecoveryLookup,
  transport: Transport = new StdioServerTransport()): Promise<number> => {
  const server = new Server({ name: 'upf-codex-questions', version: '0.1.0' }, { capabilities: { tools: {} } });
  const elicit: Elicit = (form, signal) => server.elicitInput(form, { signal });
  const handle = createCodexDiscoveryHandler(codexQuestionPort(elicit));
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [tool] }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }, { signal }) => {
    const { state, reply, language, wording, controls } = params.arguments ?? {};
    if (params.name !== toolName || !isDiscoveryState(state) || (reply !== undefined && typeof reply !== 'boolean')
      || (language !== undefined && !nonempty(language)) || (wording !== undefined && !isQuestionWording(wording))
      || (controls !== undefined && !formControls(controls))) {
      return { ...content({ kind: 'invalid-input' }), isError: true };
    }
    const presentation = {
      ...(language === undefined ? {} : { language }),
      ...(wording === undefined ? {} : { wording }),
      ...(controls === undefined ? {} : { controls }),
    };
    const labels = formLabels(presentation);
    const available = labels !== undefined && server.getClientCapabilities()?.elicitation?.form !== undefined;
    return content(await withKnowledge(await handle(state, available, signal, reply, presentation,
      codexQuestionPort(elicit, labels)), lookup));
  });
  const closed = new Promise<number>((resolve) => { server.onclose = () => resolve(0); });
  await server.connect(transport);
  return closed;
};

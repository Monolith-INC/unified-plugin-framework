import { resolveDiscoveryStep, type DiscoveryNode } from './discovery-storyboard.js';
import { normalizeQuestionAnswer, prepareRenderedQuestion, type DecisionContext, type PreparedQuestion, type QuestionCapabilities, type QuestionResponse } from './question-channel.js';
import { reduceElicitation, type ElicitationAction, type ElicitationState } from './elicitation.js';
import { resolveQuestion, type QuestionWording } from './question-catalog.js';

export interface DiscoveryActive { readonly session: string; readonly occurrence: number; readonly node: string; readonly phase: 'active'; readonly revision?: string; readonly elicitation?: ElicitationState; readonly elicitationEvents?: readonly string[] }
export interface DiscoveryWaiting { readonly session: string; readonly occurrence: number; readonly node: string; readonly phase: 'waiting'; readonly revision?: string; readonly clarification?: string; readonly pending: Extract<PreparedQuestion, { readonly continuation: DecisionContext }> }
export interface DiscoveryPaused { readonly phase: 'paused'; readonly previous: DiscoveryActive | DiscoveryWaiting }
export type DiscoveryState = DiscoveryActive | DiscoveryWaiting | DiscoveryPaused;
export type DiscoveryEvent = { readonly kind: 'ask' | 'connect'; readonly capabilities: QuestionCapabilities; readonly language?: string; readonly wording?: QuestionWording }
  | { readonly kind: 'answer'; readonly response: QuestionResponse; readonly revision?: string }
  | { readonly kind: 'recover-input'; readonly instance: string; readonly reply: boolean }
  | { readonly kind: 'facts'; readonly facts: Readonly<{ clear?: boolean; discuss?: boolean; small?: boolean; design?: boolean }>; readonly context?: string }
  | { readonly kind: 'advance'; readonly revision?: string }
  | { readonly kind: 'review-revision'; readonly revision: string }
  | { readonly kind: 'retry' }
  | { readonly kind: 'elicitation'; readonly session: string; readonly occurrence: number; readonly eventId: string; readonly action: ElicitationAction }
  | { readonly kind: 'pause' | 'resume' };
export interface DiscoveryGuidance { readonly node: string; readonly instruction: string; readonly directions: readonly string[]; readonly context?: string }
export type DiscoveryNext = { readonly kind: 'ready' | 'needs-input' | 'needs-custom' | 'waiting' | 'paused' | 'invalid-event'; readonly state: DiscoveryState; readonly guidance: DiscoveryGuidance }
  | { readonly kind: 'needs-clarification'; readonly state: DiscoveryWaiting; readonly guidance: DiscoveryGuidance; readonly custom: string }
  | { readonly kind: 'interaction-failure'; readonly state: DiscoveryActive; readonly guidance: DiscoveryGuidance; readonly reason: string }
  | { readonly kind: 'recovery'; readonly state: unknown; readonly instruction: string };

const INSTRUCTIONS: Readonly<Record<string, string>> = Object.freeze({
  context: 'Understand the request and its context.', conversation: 'Discuss one focused question at a time.',
  elicitation: 'Explore the decision with the relevant technique.', 'after-elicitation': 'Review the result and choose a direction.',
  playback: 'Play back the understanding for the user.', sizing: 'Determine the scope of the work.',
  design: 'Write the design.', review: 'Show and review the current revision.',
  execute: 'Proceed with the agreed work.', complete: 'Discovery is complete.',
});
const guidance = (node: DiscoveryNode): DiscoveryGuidance => ({ node: node.id, instruction: INSTRUCTIONS[node.id] ?? 'Recover the discovery state.', directions: node.directions.map((item) => item.target) });
const instance = (state: DiscoveryActive | DiscoveryWaiting): string => JSON.stringify([state.session, state.occurrence, state.revision ?? null]);
const equalStrings = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((value, index) => value === b[index]);
const validPending = (state: DiscoveryWaiting, node: DiscoveryNode): boolean => {
  const { pending } = state;
  const question = pending.question;
  const saved = pending.continuation.question;
  return question.kind === 'single' && saved.kind === 'single' && question.explanation === saved.explanation
    && question.allowOther === saved.allowOther && question.options.length === saved.options.length && question.options.length === pending.displayedKeys.length
    && question.options.every((option, index) => option.key === saved.options[index]?.key && option.label === saved.options[index]?.label
      && option.description === saved.options[index]?.description && option.recommended === saved.options[index]?.recommended && option.group === saved.options[index]?.group)
    && question.options.every((option, index) => option.key === pending.displayedKeys[index])
    && equalStrings(pending.displayedKeys, pending.continuation.displayedKeys)
    && equalStrings(pending.displayedKeys, node.directions.map((direction) => direction.target))
    && equalStrings(pending.answerForms, ['single-key', 'custom'])
    && pending.instance === instance(state) && pending.continuation.instance === pending.instance
    && pending.kind === pending.continuation.channel && !pending.continuation.answered
    && (pending.continuation.pendingCustomKeys === undefined || pending.continuation.pendingCustomKeys.length === 0)
    && (state.node !== 'review' || Boolean(state.revision));
};
const prepare = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'ask' | 'connect' }>): DiscoveryNext => {
  const item = resolveQuestion('discovery.direction', { language: event.language ?? 'en', instruction: INSTRUCTIONS[node.id] ?? '', directions: node.directions, ...(event.wording === undefined ? {} : { wording: event.wording }) });
  switch (true) {
    case !item.ok: return { kind: 'recovery', state, instruction: `Resolve question wording: ${item.reason}.` };
    case state.node === 'review' && !state.revision: return { kind: 'recovery', state, instruction: 'Provide the revision shown for review.' };
    default: {
      const context: DecisionContext = { instance: instance(state), question: item.question, displayedKeys: node.directions.map((direction) => direction.target), answered: false, channel: 'needs-input' };
      const pending = prepareRenderedQuestion(context, event.capabilities, true);
      return pending.kind === 'invalid' ? { kind: 'recovery', state, instruction: 'Correct the decision context.' }
        : { kind: pending.kind === 'needs-input' ? 'needs-input' : 'waiting', state: { ...state, phase: 'waiting', pending }, guidance: guidance(node) };
    }
  }
};
const unchanged = (state: DiscoveryState, node: DiscoveryNode, kind: 'ready' | 'needs-input' | 'needs-custom' | 'waiting' | 'paused' | 'invalid-event'): DiscoveryNext => ({ kind, state, guidance: guidance(node) });
const recoverInput = (state: DiscoveryWaiting, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'recover-input' }>): DiscoveryNext => {
  const replacement = { ...state, occurrence: state.occurrence + 1 };
  const pending = prepareRenderedQuestion({ ...state.pending.continuation, instance: instance(replacement) },
    { native: null, canvas: null, reply: event.reply }, true);
  switch (true) {
    case state.pending.kind !== 'native' || event.instance !== state.pending.instance || !Number.isSafeInteger(replacement.occurrence):
      return unchanged(state, node, 'invalid-event');
    case pending.kind === 'invalid': return unchanged(state, node, 'invalid-event');
    default: return unchanged({ ...replacement, pending }, node, pending.kind === 'needs-input' ? 'needs-input' : 'waiting');
  }
};
const respond = (state: DiscoveryWaiting, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'answer' }>): DiscoveryNext => {
  const answer = normalizeQuestionAnswer(state.pending.continuation, event.response);
  const target = answer.kind === 'answer' && answer.custom === null && answer.keys.length === 1 ? answer.keys[0] : undefined;
  const valid = event.revision === state.revision && target !== undefined && node.directions.some((item) => item.target === target);
  switch (true) {
    case event.revision !== state.revision: return unchanged(state, node, 'invalid-event');
    case answer.kind === 'needs-custom': return { kind: 'needs-custom', state: { ...state, pending: { ...state.pending,
      continuation: { ...state.pending.continuation, pendingCustomKeys: answer.keys } } }, guidance: guidance(node) };
    case answer.kind === 'answer' && answer.custom !== null: return { kind: 'needs-clarification', state: { ...state, clarification: answer.custom }, guidance: guidance(node), custom: answer.custom };
    case valid: return nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: target, phase: 'active' });
    default: return unchanged(state, node, 'invalid-event');
  }
};
const advance = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'advance' }>): DiscoveryNext => {
  const [only] = node.directions;
  return state.node === 'elicitation' && state.elicitation?.kind !== 'done' ? { kind: 'interaction-failure', state, guidance: guidance(node), reason: 'elicitation-incomplete' }
    : node.directions.length !== 1 || only === undefined ? unchanged(state, node, 'invalid-event')
    : only.target === 'review' && !event.revision ? { kind: 'recovery', state, instruction: 'Provide the revision shown for review.' }
      : nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: only.target, phase: 'active', ...(only.target === 'review' ? { revision: event.revision } : {}) });
};
const elicitation = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'elicitation' }>): DiscoveryNext => {
  const result = event.session === state.session && event.occurrence === state.occurrence && event.eventId.trim().length > 0 && !state.elicitationEvents?.includes(event.eventId)
    ? reduceElicitation(state.elicitation, event.action) : { ok: false as const, reason: 'stale-event' };
  return result.ok ? { kind: 'ready', state: { ...state, elicitation: result.value, elicitationEvents: [...(state.elicitationEvents ?? []), event.eventId] }, guidance: guidance(node) }
    : { kind: 'interaction-failure', state, guidance: guidance(node), reason: result.reason };
};
const factualTarget = (node: string, facts: Extract<DiscoveryEvent, { kind: 'facts' }>['facts']): string | null => {
  switch (node) {
    case 'context': return facts.small !== undefined || facts.design !== undefined ? null : facts.clear === true && facts.discuss === false ? 'execute' : facts.clear === false && facts.discuss === true ? 'conversation' : null;
    case 'sizing': return facts.clear !== undefined || facts.discuss !== undefined ? null : facts.small === true && facts.design === false ? 'execute' : facts.small === false && facts.design === true ? 'design' : null;
    default: return null;
  }
};
const fromFacts = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'facts' }>): DiscoveryNext => {
  const target = factualTarget(node.id, event.facts);
  if (target === null || !node.directions.some((direction) => direction.target === target)) return { kind: 'recovery', state, instruction: 'Provide consistent facts for this step.' };
  const next = nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: target, phase: 'active' });
  return next.kind === 'ready' && event.context !== undefined ? { ...next, guidance: { ...next.guidance, context: event.context } } : next;
};

/** Resolve one explicit event without persistence, presentation, or execution effects. */
export const nextDiscovery = (state: DiscoveryState | undefined, event?: DiscoveryEvent): DiscoveryNext => {
  if (state === undefined) return { kind: 'recovery', state, instruction: 'Restore or start a discovery session.' };
  if (state.phase === 'paused') {
    const result = resolveDiscoveryStep(state.previous.node);
    return result.kind === 'invalid-state' ? { kind: 'recovery', state, instruction: 'Restore a valid discovery step.' }
      : event?.kind === 'resume' ? nextDiscovery(state.previous) : unchanged(state, result.node, event === undefined ? 'paused' : 'invalid-event');
  }
  const result = resolveDiscoveryStep(state.node);
  if (result.kind === 'invalid-state') return { kind: 'recovery', state, instruction: 'Restore a valid discovery step.' };
  if (!state.session || !Number.isSafeInteger(state.occurrence) || state.occurrence < 0) return { kind: 'recovery', state, instruction: 'Restore the session and step occurrence.' };
  if (state.phase === 'waiting' && !validPending(state, result.node)) return { kind: 'recovery', state, instruction: 'Restore the decision shown for this session and revision.' };
  if (event?.kind === 'pause') return unchanged({ phase: 'paused', previous: state }, result.node, 'paused');
  if (event?.kind === 'review-revision' && state.node === 'review' && event.revision && event.revision !== state.revision)
    return nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: state.node, phase: 'active', revision: event.revision });
  if (state.phase === 'waiting') {
    if (event?.kind === 'retry') return nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: state.node, phase: 'active', ...(state.revision === undefined ? {} : { revision: state.revision }) });
    if (state.clarification !== undefined) return event === undefined ? { kind: 'needs-clarification', state, guidance: guidance(result.node), custom: state.clarification } : unchanged(state, result.node, 'invalid-event');
    if (event?.kind === 'recover-input') return recoverInput(state, result.node, event);
    if (event?.kind === 'answer') return respond(state, result.node, event);
    if (event?.kind === 'connect' && state.pending.kind === 'needs-input') {
      const pending = prepareRenderedQuestion(state.pending.continuation, event.capabilities, true);
      return pending.kind === 'invalid' ? unchanged(state, result.node, 'invalid-event') :
        { kind: pending.kind === 'needs-input' ? 'needs-input' : 'waiting', state: { ...state, pending }, guidance: guidance(result.node) };
    }
    return unchanged(state, result.node, event === undefined ? state.pending.continuation.pendingCustomKeys !== undefined ? 'needs-custom' : state.pending.kind === 'needs-input' ? 'needs-input' : 'waiting' : 'invalid-event');
  }
  return event?.kind === 'ask' && (state.node === 'elicitation' || result.node.directions.length === 1) ? unchanged(state, result.node, 'invalid-event')
    : event?.kind === 'ask' ? prepare(state, result.node, event)
    : event?.kind === 'advance' ? advance(state, result.node, event)
    : event?.kind === 'facts' ? fromFacts(state, result.node, event)
    : event?.kind === 'elicitation' && state.node === 'elicitation' ? elicitation(state, result.node, event)
    : unchanged(state, result.node, event === undefined ? 'ready' : 'invalid-event');
};

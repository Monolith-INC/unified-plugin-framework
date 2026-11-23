import { resolveDiscoveryStep, type DiscoveryNode } from './discovery-storyboard.js';
import { normalizeQuestionAnswer, prepareQuestion, type DecisionContext, type PreparedQuestion, type QuestionCapabilities, type QuestionResponse } from './question-channel.js';
import type { Question } from './questions.js';

export interface DiscoveryActive { readonly session: string; readonly occurrence: number; readonly node: string; readonly phase: 'active'; readonly revision?: string }
export interface DiscoveryWaiting { readonly session: string; readonly occurrence: number; readonly node: string; readonly phase: 'waiting'; readonly revision?: string; readonly pending: Extract<PreparedQuestion, { readonly continuation: DecisionContext }> }
export interface DiscoveryPaused { readonly phase: 'paused'; readonly previous: DiscoveryActive | DiscoveryWaiting }
export type DiscoveryState = DiscoveryActive | DiscoveryWaiting | DiscoveryPaused;
export type DiscoveryEvent = { readonly kind: 'ask' | 'connect'; readonly capabilities: QuestionCapabilities }
  | { readonly kind: 'answer'; readonly response: QuestionResponse; readonly revision?: string }
  | { readonly kind: 'advance'; readonly revision?: string }
  | { readonly kind: 'review-revision'; readonly revision: string }
  | { readonly kind: 'pause' | 'resume' };
export interface DiscoveryGuidance { readonly node: string; readonly instruction: string; readonly directions: readonly string[] }
export type DiscoveryNext = { readonly kind: 'ready' | 'needs-input' | 'waiting' | 'paused' | 'invalid-event'; readonly state: DiscoveryState; readonly guidance: DiscoveryGuidance }
  | { readonly kind: 'needs-clarification'; readonly state: DiscoveryWaiting; readonly guidance: DiscoveryGuidance; readonly custom: string }
  | { readonly kind: 'recovery'; readonly state: unknown; readonly instruction: string };

const INSTRUCTIONS: Readonly<Record<string, string>> = Object.freeze({
  context: 'Understand the request and its context.', conversation: 'Discuss one focused question at a time.',
  elicitation: 'Explore the decision with the relevant technique.', 'after-elicitation': 'Review the result and choose a direction.',
  playback: 'Play back the understanding for the user.', sizing: 'Determine the scope of the work.',
  design: 'Write the design.', review: 'Show and review the current revision.',
  execute: 'Proceed with the agreed work.', complete: 'Discovery is complete.',
});
const guidance = (node: DiscoveryNode): DiscoveryGuidance => ({ node: node.id, instruction: INSTRUCTIONS[node.id] ?? 'Recover the discovery state.', directions: node.directions.map((item) => item.target) });
const instance = (state: DiscoveryActive): string => JSON.stringify([state.session, state.occurrence, state.revision ?? null]);
const question = (node: DiscoveryNode): Question | null => {
  const [first, ...rest] = node.directions;
  return first === undefined ? null : { kind: 'single', explanation: INSTRUCTIONS[node.id] ?? 'Choose a direction.',
    options: [{ key: first.target, label: first.label }, ...rest.map((item) => ({ key: item.target, label: item.label }))], allowOther: true };
};
const prepare = (state: DiscoveryActive, node: DiscoveryNode, capabilities: QuestionCapabilities): DiscoveryNext => {
  const item = question(node);
  switch (true) {
    case item === null: return { kind: 'invalid-event', state, guidance: guidance(node) };
    case state.node === 'review' && !state.revision: return { kind: 'recovery', state, instruction: 'Provide the revision shown for review.' };
    default: {
      const current = item as Question;
      const context: DecisionContext = { instance: instance(state), question: current, displayedKeys: node.directions.map((direction) => direction.target), answered: false, channel: 'needs-input' };
      const pending = prepareQuestion(context, capabilities, true);
      return pending.kind === 'invalid' ? { kind: 'recovery', state, instruction: 'Correct the decision context.' }
        : { kind: pending.kind === 'needs-input' ? 'needs-input' : 'waiting', state: { ...state, phase: 'waiting', pending }, guidance: guidance(node) };
    }
  }
};
const unchanged = (state: DiscoveryState, node: DiscoveryNode, kind: 'ready' | 'needs-input' | 'waiting' | 'paused' | 'invalid-event'): DiscoveryNext => ({ kind, state, guidance: guidance(node) });
const respond = (state: DiscoveryWaiting, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'answer' }>): DiscoveryNext => {
  const answer = normalizeQuestionAnswer(state.pending.continuation, event.response);
  const target = answer.kind === 'answer' && answer.custom === null && answer.keys.length === 1 ? answer.keys[0] : undefined;
  const valid = event.revision === state.revision && target !== undefined && node.directions.some((item) => item.target === target);
  switch (true) {
    case event.revision !== state.revision: return unchanged(state, node, 'invalid-event');
    case answer.kind === 'needs-custom': return { kind: 'waiting', state: { ...state, pending: { ...state.pending,
      continuation: { ...state.pending.continuation, pendingCustomKeys: answer.keys } } }, guidance: guidance(node) };
    case answer.kind === 'answer' && answer.custom !== null: return { kind: 'needs-clarification', state, guidance: guidance(node), custom: answer.custom };
    case valid: return nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: target, phase: 'active' });
    default: return unchanged(state, node, 'invalid-event');
  }
};
const advance = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'advance' }>): DiscoveryNext => {
  const [only] = node.directions;
  return node.directions.length !== 1 || only === undefined ? unchanged(state, node, 'invalid-event')
    : only.target === 'review' && !event.revision ? { kind: 'recovery', state, instruction: 'Provide the revision shown for review.' }
      : nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: only.target, phase: 'active', ...(only.target === 'review' ? { revision: event.revision } : {}) });
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
  if (event?.kind === 'pause') return unchanged({ phase: 'paused', previous: state }, result.node, 'paused');
  if (event?.kind === 'review-revision' && state.node === 'review' && event.revision && event.revision !== state.revision)
    return nextDiscovery({ session: state.session, occurrence: state.occurrence + 1, node: state.node, phase: 'active', revision: event.revision });
  if (state.phase === 'waiting') {
    if (event?.kind === 'answer') return respond(state, result.node, event);
    if (event?.kind === 'connect' && state.pending.kind === 'needs-input') {
      const pending = prepareQuestion(state.pending.continuation, event.capabilities, true);
      return pending.kind === 'invalid' ? unchanged(state, result.node, 'invalid-event') :
        { kind: pending.kind === 'needs-input' ? 'needs-input' : 'waiting', state: { ...state, pending }, guidance: guidance(result.node) };
    }
    return unchanged(state, result.node, event === undefined ? state.pending.kind === 'needs-input' ? 'needs-input' : 'waiting' : 'invalid-event');
  }
  return event?.kind === 'ask' ? prepare(state, result.node, event.capabilities)
    : event?.kind === 'advance' ? advance(state, result.node, event)
    : unchanged(state, result.node, event === undefined ? 'ready' : 'invalid-event');
};

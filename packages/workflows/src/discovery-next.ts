import { sha256 } from '@agent-plugins/compiler';
import { resolveDiscoveryStep, type DiscoveryNode } from './discovery-storyboard.js';
import { normalizeQuestionAnswer, prepareRenderedQuestion, type DecisionContext, type PreparedQuestion, type QuestionCapabilities, type QuestionResponse } from './question-channel.js';
import { reduceElicitation, type ElicitationAction, type ElicitationState } from './elicitation.js';
import { resolveQuestion, type QuestionWording } from './question-catalog.js';

import { invalidateWrittenResults, missingDiscoveryWork, recordDiscoveryWork, type DiscoveryWork, type WorkEvent } from './discovery-work.js';

interface DiscoveryVisit {
  readonly work?: DiscoveryWork;
  readonly session: string;
  readonly occurrence: number;
  readonly node: string;
  readonly revision?: string;
  readonly material?: string;
  readonly approvedInstance?: string;
}
export interface DiscoveryActive extends DiscoveryVisit { readonly phase: 'active'; readonly elicitation?: ElicitationState; readonly elicitationEvents?: readonly string[] }
export interface DiscoveryWaiting extends DiscoveryVisit { readonly phase: 'waiting'; readonly clarification?: string; readonly pending: Extract<PreparedQuestion, { readonly continuation: DecisionContext }> }
export interface DiscoveryPaused { readonly phase: 'paused'; readonly previous: DiscoveryActive | DiscoveryWaiting }
export type DiscoveryState = DiscoveryActive | DiscoveryWaiting | DiscoveryPaused;
export type DiscoveryEvent = { readonly kind: 'ask' | 'connect'; readonly capabilities: QuestionCapabilities; readonly language?: string; readonly wording?: QuestionWording }
  | WorkEvent
  | { readonly kind: 'answer'; readonly response: QuestionResponse; readonly revision?: string }
  | { readonly kind: 'recover-input'; readonly instance: string; readonly reply: boolean }
  | { readonly kind: 'facts'; readonly facts: Readonly<{ clear?: boolean; discuss?: boolean; small?: boolean; design?: boolean }>; readonly context?: string }
  | { readonly kind: 'advance'; readonly revision?: string; readonly material?: string }
  | { readonly kind: 'review-revision'; readonly revision: string; readonly material: string }
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
  design: 'Save the written design and show its content or accessible link and revision to the user.',
  review: 'Do you approve this design?', complete: 'Discovery is complete. The user approved the shown design revision.',
});
const guidance = (node: DiscoveryNode): DiscoveryGuidance => ({ node: node.id, instruction: INSTRUCTIONS[node.id] ?? 'Recover the discovery state.', directions: node.directions.map((item) => item.target) });
const instance = (state: DiscoveryVisit): string => JSON.stringify([
  state.session, state.occurrence, state.revision ?? null,
  ...(state.material === undefined ? [] : [sha256(state.material)]),
]);
const hasMaterial = (visit: { readonly revision?: string; readonly material?: string }): visit is { readonly revision: string; readonly material: string } =>
  Boolean(visit.revision?.trim() && visit.material?.trim());
const savedWork = (visit: DiscoveryVisit): Pick<DiscoveryVisit, 'work'> => visit.work === undefined ? {} : { work: visit.work };
const savedMaterial = (visit: Pick<DiscoveryVisit, 'revision' | 'material'>): Pick<DiscoveryVisit, 'revision' | 'material'> =>
  hasMaterial(visit) ? { revision: visit.revision, material: visit.material } : {};
const reviewHeading = (visit: DiscoveryVisit): string => `${visit.material} (\`${visit.revision}\`)\n\n`;
const reviewRecovery = 'Show the saved design or its accessible link and revision. Provide both material and revision to review it.';
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
    && (state.node !== 'review' || hasMaterial(state) && question.explanation.startsWith(reviewHeading(state)));
};
const prepare = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'ask' | 'connect' }>): DiscoveryNext => {
  const missing = node.id === 'review' ? missingDiscoveryWork(state.work, state) : undefined;
  const item = resolveQuestion('discovery.direction', { language: event.language ?? 'en', instruction: INSTRUCTIONS[node.id] ?? '', directions: node.directions, ...(event.wording === undefined ? {} : { wording: event.wording }) });
  switch (true) {
    case !item.ok: return { kind: 'recovery', state, instruction: `Resolve question wording: ${item.reason}.` };
    case missing !== undefined: return { kind: 'recovery', state, instruction: missing };
    case state.node === 'review' && !hasMaterial(state): return { kind: 'recovery', state, instruction: reviewRecovery };
    default: {
      const question = node.id === 'review' ? { ...item.question, explanation: reviewHeading(state) + item.question.explanation } : item.question;
      const context: DecisionContext = { instance: instance(state), question, displayedKeys: node.directions.map((direction) => direction.target), answered: false, channel: 'needs-input' };
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
    case valid: return nextDiscovery({ ...savedWork(state), session: state.session, occurrence: state.occurrence + 1, node: target, phase: 'active',
      ...(node.id === 'review' && target === 'design' && state.work !== undefined ? { work: invalidateWrittenResults(state.work) } : {}),
      ...(target === 'complete' ? { ...savedMaterial(state), approvedInstance: state.pending.instance } : {}) });
    default: return unchanged(state, node, 'invalid-event');
  }
};
const advance = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'advance' }>): DiscoveryNext => {
  const [only] = node.directions;
  const missing = only?.target === 'review' ? missingDiscoveryWork(state.work) : undefined;
  return state.node === 'elicitation' && state.elicitation?.kind !== 'done' ? { kind: 'interaction-failure', state, guidance: guidance(node), reason: 'elicitation-incomplete' }
    : node.directions.length !== 1 || only === undefined ? unchanged(state, node, 'invalid-event')
    : missing !== undefined ? { kind: 'recovery', state, instruction: missing }
    : only.target === 'review' && !hasMaterial(event) ? { kind: 'recovery', state, instruction: reviewRecovery }
      : nextDiscovery({ ...savedWork(state), session: state.session, occurrence: state.occurrence + 1, node: only.target, phase: 'active', ...(only.target === 'review' ? savedMaterial(event) : {}) });
};
const elicitation = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'elicitation' }>): DiscoveryNext => {
  const result = event.session === state.session && event.occurrence === state.occurrence && event.eventId.trim().length > 0 && !state.elicitationEvents?.includes(event.eventId)
    ? reduceElicitation(state.elicitation, event.action) : { ok: false as const, reason: 'stale-event' };
  return result.ok ? { kind: 'ready', state: { ...state, elicitation: result.value, elicitationEvents: [...(state.elicitationEvents ?? []), event.eventId] }, guidance: guidance(node) }
    : { kind: 'interaction-failure', state, guidance: guidance(node), reason: result.reason };
};
const factualTarget = (node: string, facts: Extract<DiscoveryEvent, { kind: 'facts' }>['facts']): string | null => {
  switch (node) {
    case 'context': return facts.small !== undefined || facts.design !== undefined ? null : facts.clear === true && facts.discuss === false ? 'design' : facts.clear === false && facts.discuss === true ? 'conversation' : null;
    case 'sizing': return facts.clear !== undefined || facts.discuss !== undefined ? null : typeof facts.small === 'boolean' && typeof facts.design === 'boolean' && facts.small !== facts.design ? 'design' : null;
    default: return null;
  }
};
const fromFacts = (state: DiscoveryActive, node: DiscoveryNode, event: Extract<DiscoveryEvent, { kind: 'facts' }>): DiscoveryNext => {
  const target = factualTarget(node.id, event.facts);
  if (target === null || !node.directions.some((direction) => direction.target === target)) return { kind: 'recovery', state, instruction: 'Provide consistent facts for this step.' };
  const next = nextDiscovery({ ...savedWork(state), session: state.session, occurrence: state.occurrence + 1, node: target, phase: 'active' });
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
  if (state.node === 'complete' && (!hasMaterial(state) || missingDiscoveryWork(state.work, state) !== undefined || state.approvedInstance !== instance({ ...state, occurrence: state.occurrence - 1 })))
    return { kind: 'recovery', state, instruction: 'Restore the matching design and its approval, or show the saved design for review.' };
  if (state.phase === 'waiting' && (!validPending(state, result.node) || state.node === 'review' && missingDiscoveryWork(state.work, state) !== undefined)) return { kind: 'recovery', state, instruction: 'Restore the decision shown for this session and revision.' };
  if (event?.kind === 'pause') return unchanged({ phase: 'paused', previous: state }, result.node, 'paused');
  if (event?.kind === 'review-revision' && state.node === 'review' && hasMaterial(event) && (event.revision !== state.revision || event.material !== state.material))
    return nextDiscovery({ ...savedWork(state), session: state.session, occurrence: state.occurrence + 1, node: state.node, phase: 'active', revision: event.revision, material: event.material,
      ...(state.work === undefined ? {} : { work: invalidateWrittenResults(state.work) }) });
  if (state.phase === 'waiting') {
    if (event?.kind === 'retry') return nextDiscovery({ ...savedWork(state), session: state.session, occurrence: state.occurrence + 1, node: state.node, phase: 'active', ...savedMaterial(state) });
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
  if ((event?.kind === 'select-skills' || event?.kind === 'skill-result') && state.node !== 'complete') {
    const change = recordDiscoveryWork(state.work, event, state.node === 'review' ? state : {});
    if (!change.ok) return { kind: 'recovery', state, instruction: change.instruction };
    const updated = { ...state, work: change.work };
    return event.kind === 'skill-result' && event.status === 'failed'
      ? { kind: 'recovery', state: updated, instruction: event.recovery }
      : unchanged(updated, result.node, 'ready');
  }
  return event?.kind === 'ask' && (state.node === 'elicitation' || result.node.directions.length === 1) ? unchanged(state, result.node, 'invalid-event')
    : event?.kind === 'ask' ? prepare(state, result.node, event)
    : event?.kind === 'advance' ? advance(state, result.node, event)
    : event?.kind === 'facts' ? fromFacts(state, result.node, event)
    : event?.kind === 'elicitation' && state.node === 'elicitation' ? elicitation(state, result.node, event)
    : unchanged(state, result.node, event === undefined ? 'ready' : 'invalid-event');
};

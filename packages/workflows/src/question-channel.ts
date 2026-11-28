import { groupOptions, orderRecommendedFirst, type Question, type QuestionOption } from './questions.js';

export interface ChannelCapability {
  readonly single: boolean;
  readonly several: boolean;
  readonly consent: boolean;
  readonly custom: boolean;
  readonly optionalOnly?: boolean;
}
export interface QuestionCapabilities {
  readonly native: ChannelCapability | null;
  readonly canvas: ChannelCapability | null;
  readonly reply: boolean;
}
export type QuestionChannel = 'native' | 'canvas' | 'text' | 'needs-input';
const supports = (question: Question, capability: ChannelCapability | null, required: boolean): boolean =>
  capability !== null && !(required && capability.optionalOnly === true) && (question.kind === 'confirm' ? capability.consent
    : capability[question.kind] && capability.custom);

/** Select one channel only when it can carry the complete decision. */
export const chooseQuestionChannel = (question: Question, capabilities: QuestionCapabilities, required = true): QuestionChannel =>
  supports(question, capabilities.native, required) ? 'native' : supports(question, capabilities.canvas, required) ? 'canvas'
    : capabilities.reply ? 'text' : 'needs-input';

export interface DecisionContext {
  readonly instance: string;
  readonly question: Question;
  readonly displayedKeys: readonly string[];
  readonly answered: boolean;
  readonly channel: 'native' | 'canvas' | 'text' | 'needs-input';
  readonly allowNone?: boolean;
  readonly pendingCustomKeys?: readonly string[];
  readonly acceptKey?: string;
}
export type PreparedQuestion =
  | { readonly kind: 'native' | 'canvas' | 'text' | 'needs-input'; readonly instance: string; readonly question: Question; readonly displayedKeys: readonly string[]; readonly answerForms: readonly string[]; readonly continuation: DecisionContext }
  | { readonly kind: 'invalid'; readonly instance: string };
const forms = (context: DecisionContext): readonly string[] => context.question.kind === 'confirm' ? ['explicit-consent']
  : context.question.kind === 'several' ? context.allowNone === true ? ['multiple-keys', 'custom', 'none'] : ['multiple-keys', 'custom'] : ['single-key', 'custom'];
const validContext = (context: DecisionContext): boolean => {
  const keys = context.question.kind === 'confirm' ? context.displayedKeys : context.question.options.map((option) => option.key);
  return context.instance.trim().length > 0 && keys.every((key) => typeof key === 'string' && key.length > 0)
    && new Set(keys).size === keys.length && new Set(context.displayedKeys).size === context.displayedKeys.length
    && keys.length === context.displayedKeys.length && context.displayedKeys.every((key) => keys.includes(key))
    && (context.question.kind !== 'confirm' || context.acceptKey !== undefined && context.displayedKeys.length === 2 && context.displayedKeys.includes(context.acceptKey));
};

const displayOptions = (question: Exclude<Question, { readonly kind: 'confirm' }>, channel: QuestionChannel): readonly QuestionOption[] => {
  const ordered = orderRecommendedFirst(question.options);
  return channel === 'native' && question.kind === 'several'
    ? groupOptions(ordered).flatMap((group) => group.options)
    : ordered;
};

const displayKeys = (context: DecisionContext, channel: QuestionChannel): readonly string[] =>
  context.question.kind === 'confirm'
    ? context.displayedKeys.filter((key) => key === context.acceptKey)
      .concat(context.displayedKeys.filter((key) => key !== context.acceptKey))
    : displayOptions(context.question, channel).flatMap((option) => option.key === undefined ? [] : [option.key]);

const withChannel = (context: DecisionContext, channel: QuestionChannel, displayedKeys: readonly string[]): PreparedQuestion => {
  return { kind: channel, instance: context.instance, question: context.question,
    displayedKeys, answerForms: forms(context), continuation: { ...context, displayedKeys, channel } };
};

const prepare = (order: (context: DecisionContext, channel: QuestionChannel) => readonly string[]) =>
  (context: DecisionContext, capabilities: QuestionCapabilities, required: boolean): PreparedQuestion => {
    const channel = chooseQuestionChannel(context.question, capabilities, required);
    const allowNone = context.allowNone ?? (context.question.kind === 'several' ? context.question.allowNone : undefined) ?? !required;
    const decision = context.question.kind === 'several'
      ? { ...context, allowNone, question: { ...context.question, allowNone } } : context;
    return validContext(decision) && !decision.answered ? withChannel(decision, channel, order(decision, channel))
      : { kind: 'invalid', instance: context.instance };
  };

/** Prepare a decision whose presentation order is supplied by the caller. */
export const prepareQuestion = prepare((context) => context.displayedKeys);

/** Prepare a decision presented using the shared question guidance. */
export const prepareRenderedQuestion = prepare(displayKeys);
export type QuestionResponse =
  | { readonly channel: 'text'; readonly value: string; readonly instance: string }
  | { readonly channel: 'native' | 'canvas'; readonly keys: readonly string[]; readonly custom?: string; readonly instance: string }
  | { readonly channel: 'dismissed'; readonly instance: string };

/** A host receives the prepared decision and returns a neutral response or reports no available input. */
export interface NativeQuestionPort {
  readonly ask: (pending: Extract<PreparedQuestion, { readonly continuation: DecisionContext }>, signal: AbortSignal) =>
    () => Promise<QuestionResponse | null>;
}
export type QuestionAnswer =
  | { readonly kind: 'answer'; readonly instance: string; readonly keys: readonly string[]; readonly custom: string | null; readonly consent: 'accepted' | 'declined' | null }
  | { readonly kind: 'needs-custom'; readonly instance: string; readonly keys: readonly string[] }
  | { readonly kind: 'invalid' | 'ignored' | 'dismissed'; readonly instance: string };
const failure = (kind: 'invalid' | 'ignored' | 'dismissed', instance: string): QuestionAnswer => ({ kind, instance });
const selected = (context: DecisionContext, keys: readonly string[], custom: string | null): QuestionAnswer => {
  const valid = new Set(context.displayedKeys);
  const unique = new Set(keys);
  const count = keys.length + (custom === null ? 0 : 1);
  const good = validContext(context) && keys.every((key) => valid.has(key)) && unique.size === keys.length
    && (custom === null || custom.trim().length > 0) && (count > 0 || context.question.kind === 'several' && context.allowNone === true)
    && (context.question.kind === 'several' || count === 1)
    && (context.question.kind !== 'confirm' || custom === null && context.displayedKeys.length === 2 && context.acceptKey !== undefined && valid.has(context.acceptKey));
  return !good ? failure('invalid', context.instance) : {
    kind: 'answer', instance: context.instance, keys, custom,
    consent: context.question.kind !== 'confirm' ? null : keys[0] === context.acceptKey ? 'accepted' : 'declined',
  };
};
const textAnswer = (context: DecisionContext, value: string): QuestionAnswer => {
  const trimmed = value.trim();
  const numeric = /^\d+(?:\s*,\s*\d+)*$/.test(trimmed);
  const numbers = numeric ? trimmed.split(',').map((item) => Number(item.trim())) : [];
  const keys = numbers.flatMap((number) => context.displayedKeys[number - 1] === undefined ? [] : [context.displayedKeys[number - 1]!]);
  const other = context.question.kind !== 'confirm' && numbers.includes(context.displayedKeys.length + 1);
  const validOther = other && numbers.length === keys.length + 1 && new Set(numbers).size === numbers.length
    && (context.question.kind === 'several' || numbers.length === 1);
  const none = context.question.kind === 'several' && trimmed.toLowerCase() === 'none';
  return context.pendingCustomKeys !== undefined ? selected(context, context.pendingCustomKeys, value)
    : none ? context.allowNone === true ? selected(context, [], null) : failure('invalid', context.instance)
    : validOther ? { kind: 'needs-custom', instance: context.instance, keys }
    : trimmed.length === 0 || numeric && keys.length !== numbers.length ? failure('invalid', context.instance)
    : numeric ? selected(context, keys, null)
      : context.question.kind === 'confirm' ? failure('invalid', context.instance) : selected(context, [], value);
};

/** Normalize a response to its decision instance; duplicate callbacks do not produce an answer. */
export const normalizeQuestionAnswer = (context: DecisionContext, response: QuestionResponse): QuestionAnswer => {
  switch (true) {
    case response.instance === undefined: return failure('invalid', context.instance);
    case context.answered || response.instance !== context.instance: return failure('ignored', context.instance);
    case !validContext(context): return failure('invalid', context.instance);
    case response.channel !== 'dismissed' && response.channel !== context.channel: return failure('invalid', context.instance);
    case response.channel === 'dismissed': return failure('dismissed', context.instance);
    case response.channel === 'text': {
      const answer = response as Extract<QuestionResponse, { channel: 'text' }>;
      return typeof answer.value === 'string' ? textAnswer(context, answer.value) : failure('invalid', context.instance);
    }
    default: {
      const answer = response as Extract<QuestionResponse, { channel: 'native' | 'canvas' }>;
      return Array.isArray(answer.keys) && answer.keys.every((key) => typeof key === 'string')
        && (answer.custom === undefined || typeof answer.custom === 'string')
        ? selected(context, answer.keys, answer.custom ?? null) : failure('invalid', context.instance);
    }
  }
};

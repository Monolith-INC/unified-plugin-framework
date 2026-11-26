/** Reasons an input transport cannot deliver an answer. */
export type QuestionInterruption = 'timeout' | 'disconnect' | 'dismissed' | 'unavailable';

const units = {
  timeout: '3-mechanics/question-timeout',
  disconnect: '3-mechanics/question-disconnect',
  dismissed: '3-mechanics/question-dismissed',
  unavailable: '3-mechanics/question-unavailable',
} as const satisfies Readonly<Record<QuestionInterruption, string>>;

export type QuestionRecoveryUnit = (typeof units)[QuestionInterruption];

/** Resolve a recovery event to its exact Project Knowledge unit. */
export const questionRecoveryUnit = (reason: QuestionInterruption): QuestionRecoveryUnit => units[reason];

/** The configured knowledge reader supplies current guidance as data. */
export type QuestionRecoveryLookup = (unit: QuestionRecoveryUnit) => () => Promise<string | null>;

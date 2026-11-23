import type { DiscoveryDirection } from './discovery-storyboard.js';
import type { Question } from './questions.js';

export type QuestionId = 'discovery.direction';
export interface QuestionWording { readonly explanation: string; readonly labels: Readonly<Record<string, string>> }
export interface DirectionQuestionInput { readonly language: string; readonly instruction: string; readonly directions: readonly DiscoveryDirection[]; readonly wording?: QuestionWording }
export type CatalogResult = { readonly ok: true; readonly id: QuestionId; readonly language: string; readonly question: Question }
  | { readonly ok: false; readonly reason: 'unknown-question' | 'missing-language' | 'missing-wording' | 'missing-directions' };

/** Resolve a used question; callers supply localized text where no translation has been authored. */
export const resolveQuestion = (id: string, input: DirectionQuestionInput): CatalogResult => {
  const [first, ...rest] = input.directions;
  const language = input.language.trim();
  const english = language.toLowerCase() === 'en' || language.toLowerCase().startsWith('en-');
  const explanation = input.wording?.explanation ?? (english ? input.instruction : '');
  const label = (direction: DiscoveryDirection): string => input.wording?.labels[direction.target] ?? (english ? direction.label : '');
  if (first === undefined) return { ok: false, reason: 'missing-directions' };
  switch (true) {
    case id !== 'discovery.direction': return { ok: false, reason: 'unknown-question' };
    case language.length === 0: return { ok: false, reason: 'missing-language' };
    case explanation.trim().length === 0 || input.directions.some((direction) => label(direction).trim().length === 0): return { ok: false, reason: 'missing-wording' };
    default: return { ok: true, id: 'discovery.direction', language, question: { kind: 'single', explanation,
      options: [{ key: first.target, label: label(first) }, ...rest.map((direction) => ({ key: direction.target, label: label(direction) }))], allowOther: true } };
  }
};

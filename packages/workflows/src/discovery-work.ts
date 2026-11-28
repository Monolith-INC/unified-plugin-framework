import { brainstormingDiscoveryAdapter, DISCOVERY_OPERATIONS, discoveryLayerKey, requiredDiscoveryChecks, type DiscoveryOperation } from './discovery.js';

interface SkillSelection { readonly mode: DiscoveryOperation; readonly selected: readonly string[] }
interface ReviewMaterial { readonly revision?: string; readonly material?: string }
interface SkillObservation extends ReviewMaterial {
  readonly step: string;
  readonly evidence: string;
  readonly sessionRecord?: string;
}
export type SkillEvidence = SkillObservation & (
  | { readonly status: 'completed' }
  | { readonly status: 'failed'; readonly recovery: string }
);
export interface DiscoveryWork extends SkillSelection { readonly results: readonly SkillEvidence[] }
export type WorkEvent = ({ readonly kind: 'select-skills' } & SkillSelection) | ({ readonly kind: 'skill-result' } & SkillEvidence);
type Change = { readonly ok: true; readonly work: DiscoveryWork } | { readonly ok: false; readonly instruction: string };

const record = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const optionalKeys = new Set(brainstormingDiscoveryAdapter.catalog.map(discoveryLayerKey));
export const isSelection = (value: unknown): value is SkillSelection => record(value)
  && DISCOVERY_OPERATIONS.some((mode) => mode === value.mode) && Array.isArray(value.selected)
  && value.selected.every((key: unknown) => nonempty(key) && optionalKeys.has(key))
  && new Set(value.selected).size === value.selected.length;
const writtenStep = (step: string): boolean =>
  step.startsWith('bmad-review:') || ['bmad-spec', 'bmad-product-brief', 'bmad-prd'].includes(step);
export const isSkillEvidence = (value: unknown): value is SkillEvidence => record(value)
  && nonempty(value.step) && nonempty(value.evidence)
  && (writtenStep(value.step) ? nonempty(value.revision) && nonempty(value.material)
    : value.revision === undefined && value.material === undefined)
  && (value.sessionRecord === undefined || nonempty(value.sessionRecord))
  && (value.status === 'failed' && nonempty(value.recovery)
    || value.status === 'completed' && value.recovery === undefined
      && (value.step !== 'bmad-forge-idea' || nonempty(value.sessionRecord)));
export const isDiscoveryWork = (value: unknown): value is DiscoveryWork => record(value) && isSelection(value)
  && Array.isArray(value.results) && value.results.every(isSkillEvidence);

const stepsFor = (key: string): readonly string[] => key.startsWith('bmad-review:')
  ? key.slice('bmad-review:'.length).split('+').map((lens) => `bmad-review:${lens}`) : [key];
const checks = (work: DiscoveryWork): readonly (readonly string[])[] =>
  [...requiredDiscoveryChecks(work.mode), ...work.selected.map((key) => [key])]
    .flatMap((alternatives) => alternatives.length === 1
      ? alternatives.flatMap(stepsFor).map((key) => [key]) : [alternatives]);
const requiredRecovery = (step: string): string =>
  `Run ${step} and record its result. If it cannot run, report the failed step and follow its installed recovery instructions.`;

export const invalidateWrittenResults = (work: DiscoveryWork): DiscoveryWork =>
  ({ ...work, results: work.results.filter((result) => result.revision === undefined) });

const matchesMaterial = (result: SkillEvidence, current: ReviewMaterial): boolean =>
  writtenStep(result.step) ? current.revision !== undefined && current.material !== undefined
    && result.revision === current.revision && result.material === current.material
    : result.revision === undefined && result.material === undefined;

/** The host runs each skill. A selection, an unread result, or a result for an old design cannot complete it. */
export const missingDiscoveryWork = (work: DiscoveryWork | undefined, current: ReviewMaterial = {}): string | undefined => {
  if (work === undefined) return 'Restore the discovery mode and optional skill choices with select-skills.';
  const matches = (alternatives: readonly string[], result: SkillEvidence): boolean =>
    alternatives.includes(result.step) && matchesMaterial(result, current);
  const missing = checks(work).find((alternatives) => alternatives.some((key) => !writtenStep(key) || current.revision !== undefined)
    && !work.results.some((result) => result.status === 'completed' && matches(alternatives, result)));
  return missing === undefined ? undefined
    : work.results.flatMap((result) => result.status === 'failed' && matches(missing, result) ? [result.recovery] : [])[0]
      ?? requiredRecovery(missing.join(' or '));
};
export const recordDiscoveryWork = (work: DiscoveryWork | undefined, event: WorkEvent, current: ReviewMaterial): Change => {
  switch (event.kind) {
    case 'select-skills': return work === undefined && isSelection(event)
      ? { ok: true, work: { mode: event.mode, selected: event.selected, results: [] } }
      : { ok: false, instruction: 'Restore the recorded selection for this discovery session.' };
    case 'skill-result': {
      const { kind: _event, ...result } = event;
      return work !== undefined && checks(work).some((alternatives) => alternatives.includes(result.step)) && isSkillEvidence(result)
        && matchesMaterial(result, current)
        ? { ok: true, work: { ...work, results: [...work.results.filter((old) => old.step !== result.step), result] } }
        : { ok: false, instruction: requiredRecovery(result.step) };
    }
  }
};

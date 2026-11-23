/** Selection data for one elicitation visit; workflow navigation remains outside this reducer. */
export type ElicitationState =
  | { readonly kind: 'selecting'; readonly methods: readonly string[] }
  | { readonly kind: 'running'; readonly methods: readonly string[]; readonly selected: readonly string[] }
  | { readonly kind: 'reviewing'; readonly methods: readonly string[]; readonly selected: readonly string[] }
  | { readonly kind: 'done' };
export type ElicitationAction = { readonly kind: 'offer'; readonly methods: readonly string[] }
  | { readonly kind: 'choose'; readonly methods: readonly string[] }
  | { readonly kind: 'review' | 'apply' | 'reject' | 'proceed' };
export type ElicitationResult = { readonly ok: true; readonly value: ElicitationState }
  | { readonly ok: false; readonly reason: 'invalid-methods' | 'invalid-transition' };
const ok = (value: ElicitationState): ElicitationResult => ({ ok: true, value });
const failure = (reason: 'invalid-methods' | 'invalid-transition'): ElicitationResult => ({ ok: false, reason });
const valid = (methods: readonly string[]): boolean => methods.length > 0 && methods.every((method) => typeof method === 'string' && method.trim().length > 0) && new Set(methods).size === methods.length;

/** Change selection only; this reducer does not run methods, present prompts or navigate. */
export const reduceElicitation = (state: ElicitationState | undefined, action: ElicitationAction): ElicitationResult => {
  switch (action.kind) {
    case 'offer': return (state === undefined || state.kind === 'selecting') && valid(action.methods)
      ? ok({ kind: 'selecting', methods: [...action.methods] }) : failure('invalid-methods');
    case 'choose': return state?.kind === 'selecting' && valid(action.methods) && action.methods.every((method) => state.methods.includes(method))
      ? ok({ kind: 'running', methods: state.methods, selected: [...action.methods] }) : failure('invalid-methods');
    case 'review': return state?.kind === 'running' ? ok({ ...state, kind: 'reviewing' }) : failure('invalid-transition');
    case 'apply':
    case 'reject': return state?.kind === 'reviewing' ? ok({ kind: 'selecting', methods: state.methods }) : failure('invalid-transition');
    case 'proceed': return state?.kind === 'selecting' ? ok({ kind: 'done' }) : failure('invalid-transition');
  }
};

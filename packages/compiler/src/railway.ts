import type { Diagnostic } from "@agent-plugins/core";

import { failure, success, type Result } from "./index.js";

/** The railway step: runs `next` on a success and passes a failure through untouched. */
export const andThen = <A, B>(result: Result<A>, next: (value: A) => Result<B>): Result<B> =>
  result.ok ? next(result.value) : result;

/** `andThen` over a pending result; `next` may itself be pending. */
export const andThenAsync = <A, B>(
  pending: Promise<Result<A>>,
  next: (value: A) => Result<B> | Promise<Result<B>>,
): Promise<Result<B>> => pending.then((result) => (result.ok ? next(result.value) : result));

/** A failure from a diagnostics list, with `fallback` standing in when the list is empty. */
export const failureOf = (diagnostics: readonly Diagnostic[], fallback: Diagnostic): Result<never> => {
  const [first, ...rest] = diagnostics;
  return failure(first ?? fallback, ...rest);
};

/** `value` when there are no diagnostics, otherwise their failure. */
export const fromDiagnostics = <A>(diagnostics: readonly Diagnostic[], value: A): Result<A> => {
  const [first, ...rest] = diagnostics;
  return first === undefined ? success(value) : failure(first, ...rest);
};

/** A monoid: an associative `concat` with a two-sided identity `empty`. */
export interface Monoid<A> {
  readonly concat: (x: A, y: A) => A;
  readonly empty: A;
}

/**
 * Results of lists: two successes append their values; any failure wins over a success, and two failures
 * accumulate their diagnostics in order. `empty` is the success of no values.
 */
export const resultListMonoid = <A>(): Monoid<Result<readonly A[]>> => ({
  empty: success([]),
  concat: (x, y) =>
    x.ok && y.ok ? success([...x.value, ...y.value]) : x.ok ? y : y.ok ? x : failure(x.diagnostics[0], ...x.diagnostics.slice(1), ...y.diagnostics),
});

/** Folds a collection from `empty` with `concat`. */
export const concatAll =
  <A>(monoid: Monoid<A>) =>
  (values: readonly A[]): A =>
    values.reduce(monoid.concat, monoid.empty);

/** Every success's value in order, or every failure's diagnostics. */
export const sequenceResults = <A>(results: readonly Result<A>[]): Result<readonly A[]> =>
  concatAll(resultListMonoid<A>())(results.map((result) => andThen(result, (value): Result<readonly A[]> => success([value]))));

/** A plain JSON-style object, as opposed to an array, `null` or a primitive. */
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

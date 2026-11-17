# Project instructions

## Project scope

This repository is Unified Plugin Framework, a fork of Monolith-INC/agent-plugins-toolkit.

Use the existing Linear project **Unified Plugin Framework**:
- Project URL: https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview
- Project identifier: P-AGE-6
- Project UUID: 93a112cc-ef52-49f7-9e04-3642a5f78a17
- Team: Agentical Monolithics Cognitivity (AGE)

Scope issue searches and new work to this project. Do not create a replacement project or mix work with the upstream Agent Plugins Toolkit project. Plans and specifications belong under docs/work-items/.

## Implementation principles

Follow the linked Linear implementation plan. Keep pure planning separate from filesystem, network and process effects. Preserve immutable inputs and return explicit results. Reuse inherited toolkit behavior rather than creating duplicate implementations. Keep original dependency source files unchanged.

## Checks

Run pnpm install --frozen-lockfile, pnpm build, pnpm typecheck, pnpm test and pnpm payloads:verify when implementation changes require them.

## Working efficiently

Resources are limited: every review, check and sub-agent must add quality, not repeat work already done.

1. **One review pass per change, sized to the change.**
   - A feature or behaviour change gets one requirements review on the open pull request (`review-story-postflight`, posting only after the user confirms) and one thermos pass. Do not also run pre-flight or `review-feature` on the same change; they repeat the post-flight.
   - A small change, such as docs, a one-file fix or a test-only change, gets no thermos and no separate review skill: check it yourself once, against what was asked.
   - Apply all findings in one round of fixes. Do not review the fixes again unless they change behaviour.
2. **Sub-agents run on a mid-tier model.** Launch reviewers and other sub-agents on a mid-tier model, not the most capable tier, overriding any top-tier default in their definitions. Use the top tier only when the user asks for it.
3. **Low reasoning effort for routine steps.** Pushing, committing, status checks, ticket updates and small edits need no deep reasoning; keep replies and tool use short.
4. **Full checks once, before pushing.** While working, run only the narrow check that answers the question at hand: build the touched package, run its own tests. Run the full suite (install, typecheck, build, test, `payloads:verify`, hook tests, in a clean clone) once, when the work is done and before asking to push. Re-run it only if code changed after that run.

# Functional programming rules

These rules are mandatory. Runnable TypeScript references: `docs/functional-rules/examples/`.

<!-- fp-core.md -->
Applies to: all code.

# The Functional Paradigm (Core Mandate)

All code is functional by default. Apply these rules autonomously to every generation and refactor.

## Purity & Effects

1. Functions must be pure and deterministic. Side effects are rare, isolated, and explicitly marked as such.
2. Functions must return values. A void function is an unjustified side effect — exceptions must be justified and documented with a comment.
3. Effects are values: wrap side-effecting work in a deferred type (`Task`, thunk, `IO`). Execute (`run()`) only at the program edge — controllers, gateways, data sources, `main`, test harnesses. One effectful invocation per call site; everything below it stays pure.
4. Logging lives in named boundary methods at decision points, never threaded through pure transformations.

## Errors Are Values

1. Anything that can fail returns a typed result (`Either<Failure, T>`). Throwing for business errors is prohibited; exceptions are reserved for platform/unexpected crashes.
2. Handling failure is mandatory. No silent catches: handle the failure state explicitly or rethrow.
3. Validation is a railway: chain each predicate with `flatMap`; the first failure short-circuits. No for-loops over validators, no early-return ladders.

## Branching

1. Use pattern matching (`switch` expressions) for all branching. Exhaustive, no fall-through.
2. No `if/else` blocks, no `else`/`else if`. A single `if` statement is acceptable only for a single-block evaluation.
3. When N inputs produce M outputs, switch on a tuple of the inputs — a transition table the compiler checks for exhaustiveness.
4. Consume wrapped values with `fold`. Never branch on `isLeft()` / `isRight()` / `isSome()` / `isNone()` in new code.

## Data & State

 1. Immutable by default: no mutation, no reassignment, all bindings `final`/`const`/`readonly`.
 2. Avoid intermediate variable declarations — chain expressions and transformations instead.
 3. Model multi-outcome state as a sealed ADT: one named variant per outcome, payload only where needed. No enums with extra fields, no nullable discriminators. The variant name _is_ the meaning.
 4. Prefer higher-order collection methods (`map`, `where`/`filter`, `fold`, `expand`) over imperative loops.
 5. Do pass functions as arguments; compose small functions into pipelines.

## Algebra (Monoids Are Foundational)

1. Every aggregation is a monoid. Whenever values of one type are combined — sums, merges, unions, overrides, validations, logs — name the combining operation `concat` and its identity `empty`. An accumulator loop is an unnamed monoid; name it.
2. The laws are the contract: `concat` is associative (`concat(concat(x, y), z) = concat(x, concat(y, z))`) and `empty` is a two-sided identity (`concat(empty, x) = x = concat(x, empty)`). If an identity exists it is unique. An instance that breaks a law is a bug, not a style issue.
3. Not every semigroup is a monoid. If no lawful `empty` exists (e.g. joining strings with a separator), stay at semigroup and fold only non-empty collections.
4. Prove the laws on the real representation. Floating-point addition is not associative; integer arithmetic is lawful only while results stay exact; use exact domains (bigint, integer cents, rationals) when the laws must hold.
5. Fold collections from `empty` (`concatAll`): no seed argument, and the empty collection is handled by construction.
6. Derive, don't hand-write: a record is a monoid when each field is (combine field-wise); structures nest (`Point` → `Vector`). Every operation has a dual (flip the arguments).
7. Absence is a choice of monoid. Combining optional values must name its semantics: **first** (leftmost present wins), **last** (rightmost present wins — overrides, patches, settings layers), or **applicative** (any absence absorbs; both present → combine payloads, identity `some(empty)`). Never merge optionals with ad-hoc conditionals.

## Shape & Size

 1. If a function does more than one thing, refactor. When a body grows past ~6 lines or one `fold`, extract a tiny private helper whose name describes the step — the name is the comment.
 2. If it can be done with less code, do it with less code.

## General

 1. Code must be efficient first, readable next, orthodox last.
 2. Code is its own documentation; it must be as clear as algebra.
 3. Code that is not testable is not deployable.

<!-- fp-dart-style.md -->
Applies to: `**/*.dart`

# Dart: The Functional Stricture

Follow Effective Dart (<https://dart.dev/effective-dart>), filtered through the
functional mandate.

## Style

1. `UpperCamelCase` for types and extensions; `lowerCamelCase` for constants,
   members, parameters (acronyms as words: `HttpConnection`);
   `lowercase_with_underscores` for files, directories, packages.
2. Import order: `dart:`, then `package:`, then relative. Exports after imports.
   Members: fields (static → final), constructors (named → factory),
   getters/setters, methods (public → private).
3. Code adheres strictly to `dart format`. Trailing commas mandatory on
   parameter lists and collection literals.

## Documentation

1. `///` doc comments on all public members; first line a standalone summary
   ending in a period; complete sentences; backticks for identifiers.
2. Document _why_ (invariants, edge cases), never self-evident _what_.

## Usage

1. REJECT `var`: all locals are `final` or `const`; explicit types when
   inference is ambiguous.
2. Collection literals over constructors; higher-order methods (`.map`,
   `.where`, `.fold`, `.expand`) over `for`/`while`.
3. Expression bodies (`=>`) for any member that fits one line.
4. Named parameters mandatory for functions with more than 2 arguments or any
   boolean flag.
5. Interpolation over concatenation; adjacent literals for multi-line strings.

## Design

 1. Classes are `@immutable`, fields `final`, `const` constructors wherever
    possible.
 2. No public fields — expose data through getters, records, or immutable
    structures.
 3. Records for multiple return values; sealed classes + pattern matching for
    state.
 4. Prefer switch expressions over switch statements.

## Asynchrony

 1. Never `async void` — always `Future<void>` with explicit `await`.
 2. Unawaited futures prohibited; wrap in `unawaited()` only when
    fire-and-forget is truly intended.
 3. `async`/`await` is not parallelism: move CPU-bound work (JSON decode,
    mapping, sorting large sets) to `Isolate.run()` / `compute()`.
 4. Run independent async work concurrently with `Future.wait` instead of
    sequential `await` chains.

<!-- fp-dartz.md -->
Applies to: `**/*.dart`

# Dartz: The Functional Core

## Either (Error Handling)

1. Every Domain and Data layer method that can fail returns `Either<Failure, Success>`. Throwing for business errors is prohibited.
2. Consume with `.fold()` (or `.getOrElse`) — both cases handled explicitly. Reject `isLeft()`/`isRight()` unwrapping.
3. Validation railway: chain predicates with `.flatMap`; each step returns `right(Nothing())` or `left(ValidationFailure(...))`; first `Left` short-circuits.

## Option (Absence)

1. Reject `Option<T>` for simple absence — use native nullable (`?`). Reserve `Option` for composition chains requiring `.flatMap`.
2. At nullable boundaries, lift with `optionOf(nullable)`. Escape with `.toNullable()` only at framework/UI/external-API boundaries.
3. `map` when the callback returns a plain value; `flatMap`/`bind` when it returns `Option`; `orElse` to recover from `None`; `toEither(() => failure)` when absence becomes a domain failure; `Option.mapN` to combine multiple optionals.

## Task (Deferred Effects)

1. Side-effecting futures go through the canonical chain — never `try/catch` in a use case:

```dart
Task(() => sideEffectingCall())      // pure thunk; nothing runs yet
    .attempt()                       // Task<Either<Object, A>>
    .mapLeft<Failure>((e) => DomainFailure(innerError: e, innerMessage: '$e'))
    .mapRight((a) => mapToDomain(a))
    .run();                          // materialize ONLY at the boundary
```

2. Never `await` inside a `Task` builder — the thunk builds the future lazily.
3. `Task.value`/`Task.failed` over hand-wrapped resolved futures; `flatMap` for callbacks returning `Task`; `flatTap` for logging/telemetry without altering the value.
4. Sequence by default (`Task.map2`, `tupled`); go parallel (`parMap`, `parTupled`, `both`) only when tasks are truly independent.
5. `bracket`/`guarantee` over manual `try/finally` for resource lifetimes. `ifM` over imperative branching on a `Task<bool>`.
6. `run()` re-executes the thunk every call — no memoization assumptions. `race` losers keep running; Futures don't cancel.

## Types & Collections

1. Reject `Tuple` in return types — use a named `record` or dedicated class.
2. `IList`/`IMap` stay immutable; convert to native collections only at the UI boundary.

<!-- fp-rxdart.md -->
Applies to: `**/*.dart`

# RxDart: The Reactive Flow

## Stream Composition

1. Declarative mandate: reject manual `.listen()` inside business logic. Compose output streams from input streams with operators (`map`, `switchMap`, `combineLatest`).
2. Operator discipline:
   - `debounceTime` mandatory for user input (~400ms for input-driven queries — prevents per-keystroke calls and rebuild storms).
   - `distinctUnique` mandatory to prevent redundant emission processing.
   - `switchMap` mandatory for network requests, to cancel stale calls.

## Memory Safety

1. When `.listen()` is unavoidable (UI edge), bind the subscription to a `CompositeSubscription` or a flutter_hook that guarantees disposal.
2. Subject restrictions:
   - `BehaviorSubject`: approved for state holding (current-value access).
   - `PublishSubject`: approved for events (clicks, toasts).
   - `ReplaySubject`: restricted — explicit `maxSize` bounds only.

<!-- fp-flutter.md -->
Applies to: `**/*.dart`

# Flutter: Pure Presentation

## Widget Purity

1. Widgets are pure containers — they present. Business logic and data fetching belong strictly in controllers, ViewModels, helper classes, or functions.
2. Refactor thresholds: build methods > 30 lines or widget classes > 100 lines must be decomposed.
3. Atomic components: small, single-purpose private `StatelessWidget` classes over helper methods returning widgets.
4. Avoid `StatefulWidget`, `ValueNotifier`, `ChangeNotifier`, and the like.

## State Management

1. Ephemeral UI state (animations, scroll controllers): `flutter_hooks`.
2. Shared business state: the project's chosen container (Provider / Riverpod / GetX) — logic stays functional inside it.
3. Render complex UI state by exhaustively switching over a sealed state ADT.
4. Give state classes value equality (`Equatable`, records, or sealed data classes) — reference comparison triggers spurious rebuilds.

## Performance

1. The 16ms frame budget covers all Dart execution: parsing and mapping jank comes from the data layer, not the widget tree. Offload heavy `.map().where().toList()..sort()` chains to `Isolate.run()`/`compute()`.
2. Startup: parallelize independent init with `Future.wait`; defer non-critical work with `addPostFrameCallback`; prefetch images concurrently.
3. Always `ListView.builder` for large datasets (`itemExtent` when height is fixed); cursor-based pagination with ~200–400px prefetch.
4. Heavy boolean getters short-circuit with `||`/`&&` instead of list processing (`.any`, `.reduce`).

<!-- fp-typescript.md -->
Applies to: `**/*.ts`

# TypeScript: Functional Seams

The core paradigm rule applies in full. Everything below is plain, current TypeScript — no library is required. Runnable, type-checked references live in `docs/functional-rules/examples/`. When a project already uses a functional library, use its instances instead of re-declaring them; the principles are the same.

## Seams

1. `readonly` on every interface field; `const` only — no `let`, no mutation.
2. Replace branching lookups with data: a `ReadonlyMap` (or frozen record) plus nullish coalescing to a named fallback entry of the same table — one source of truth, no `!`. See `docs/functional-rules/examples/lookup-tables.ts`.

```typescript
const INTERNAL: StatusEntry = { httpCode: 500, message: "Internal server error." };
const STATUS: ReadonlyMap<string, StatusEntry> = new Map([
  ["not-found", { httpCode: 404, message: "Resource not found." }],
  ["internal", INTERNAL],
]);
export const fetchStatusCode = (key: string): StatusEntry => STATUS.get(key) ?? INTERNAL;
```

3. Prefer `??` over `||` for absence — `||` swallows valid falsy values.
4. Brand primitive types that carry domain meaning; refine with type guards and named predicates instead of inline boolean soup.
5. Errors as values internally; `null` is acceptable at internal seams, typed errors (`HttpsError` etc.) only at the outermost edge.
6. Partial updates travel as patch objects, not mutations.
7. Fold aggregations with monoids — see **Monoids** below; never an accumulator loop.
8. Arrow-function expression bodies; pipelines of `map`/`filter`/`reduce` over loops; small named helpers over comments.

## Monoids

The core **Algebra** rules apply in full; this is their TypeScript shape. Reference: `docs/functional-rules/examples/monoids.ts`.

1. Declare the abstraction once, structurally:

```typescript
interface Semigroup<A> { readonly concat: (x: A, y: A) => A }
interface Monoid<A> extends Semigroup<A> { readonly empty: A }
```

2. Instances are plain `const` records: sum `{ concat: (x, y) => x + y, empty: 0 }`, product (`empty: 1`), string (`""`), all (`&&`, `true`), any (`||`, `false`). Use `bigint` (`empty: 0n`) when sums must be exact; `number` is lawful only over exact integers.
3. Fold with `concatAll = <A>(M: Monoid<A>) => (as: ReadonlyArray<A>): A => as.reduce(M.concat, M.empty)` — no seed, safe on `[]`.
4. Derive record monoids with a mapped type, `struct<A>(fields: { readonly [K in keyof A]: Monoid<A[K]> }): Monoid<A>`, and nest them (`Point` → `Vector`). Duals come from `reverse(M)` (flip arguments).
5. Model absence as a discriminated union `Option<A>` and pick its monoid explicitly: `first<A>()`, `last<A>()` (= `reverse(first())`), or `applicative(M)` with `empty: some(M.empty)`. Settings layers are `struct({ field: last<T>(), ... })` folded workspace → user.
6. Every new instance ships with a law test (associativity + both identities) over representative samples, run against the real runtime representation.

## Effects as Capabilities

Reference: `docs/functional-rules/examples/effects-as-capabilities.ts`.

1. Domain code never calls `console`, `process.stdin`, `Math.random`, `Date.now`, `fetch` or the filesystem directly. It declares narrow capabilities and receives them as a parameter:

```typescript
interface Console<F extends Kind> {
  readonly putStrLn: (message: string) => HKT<F, void>;
  readonly getStrLn: HKT<F, string>;
}
type Main<F extends Kind> = Monad<F> & Console<F> & Random<F>;
const program = <F extends Kind>(F: Main<F>): HKT<F, void> => /* written once */;
```

2. Capabilities compose by intersection (`Monad<F> & Console<F> & Random<F>`); a program asks for exactly the set it uses.
3. Write the program once; interpret it at the edge. Production supplies a `Task<A> = () => Promise<A>` interpreter and runs it exactly once (`await main()`); tests supply a pure state-threading interpreter (`State<S, A> = (s: S) => readonly [A, S]`) over immutable input/output/random queues and assert the whole recorded output with `deepEqual` — no mocks, no I/O, fully deterministic.
4. Higher-kinded types need no library: a registry `interface Kinds<A> { readonly Task: Task<A>; readonly Test: State<TestData, A> }` with `type HKT<F extends keyof Kinds<unknown>, A> = Kinds<A>[F]`. Use this generic form when two or more real interpreters exist; with one, inject a plain record of functions (`interface Clock { readonly now: () => Date }`).
5. Sequencing is `flatMap`; `tap` runs an effect for its side effect and keeps the original value. A `Promise` return type alone does not make a computation pure — the effect is pure only while it is an unexecuted description.

## Recursion and Parsing

1. Repetition over effects is recursion, not `while`: a re-prompt, retry or game loop returns the same effect again (`default: return shouldContinue(name)`; `again ? gameLoop(name) : of(undefined)`).
2. Parse, don't validate: raw input becomes `Option`/`Either` at the boundary (`parseInteger: (s: string) => Option<number>`) and is consumed exactly once with an exhaustive `switch` on its tag (a `fold`). Downstream code never re-checks the raw value.

# ADR-001: Typed Workflow Adapter Interface

| Field | Value |
| :--- | :--- |
| **Status** | `Accepted` |
| **Date** | `2026-11-15` |
| **Author(s)** | `@theocarranza` |
| **Deciders** | `@theocarranza` |
| **Related Issues / Specs** | [AGE-92](https://linear.app/agentical-monolithics/issue/AGE-92/code-review-workflow-adapter), [Workflow adapter architecture](../work-items/2026-11-15-workflow-adapter-architecture.md) |

> **Decision:** Every workflow's contract is a TypeScript type of its operations, and every adapter is a frozen object implementing the generic `WorkflowAdapter<Operation>` interface, so the compiler rejects an adapter that leaves any contract operation unfulfilled.

## 1. Context

Unified Plugin Framework offers workflows (code review, Discovery, project tracking) built on outside plugins it onboards as dependencies. Each workflow keeps a stable contract with users and agents, and maps that contract onto whichever plugin currently does the work. Replacing a plugin must not change the contract.

The first adapter (code review over the Monolithic Code Review Toolkit) was drafted as skill files plus a loose JSON mapping. Nothing checked that the mapping covered the contract, and the contract existed only as prose.

The inherited toolkit already solves the same problem in the other direction. Host adapters implement the frozen `VendorAdapter` interface in `packages/compiler`; `VENDOR_IDS` is an `as const` list, `VendorId` is derived from it, and a `Record<VendorId, VendorAdapter>` registry makes a missing host a type error.

Plugins mostly offer skills, which the model runs, rather than functions the code calls. An adapter therefore maps operations to plugin skills; it does not wrap function calls.

## 2. Decision Drivers

- The contract must be explicit, versioned and stable when a plugin changes.
- An adapter that misses a contract operation must fail at compile time, not when a user runs it.
- Swapping a plugin must stay local: one adapter object, plus the few places that name the plugin, all checked by tests.
- Readiness and upgrade checks must be pure functions over an adapter, testable without a host.
- Follow the pattern the codebase already uses for host adapters.
- Functional discipline: immutable data, total mappings, no runtime registration.

## 3. Considered Options

1. **Typed interface with frozen implementations — chosen**
2. **JSON mapping file read at runtime**
3. **Contract in skill prose only**

## 4. Decision Outcome

Chosen option: **Typed interface with frozen implementations**, because the compiler enforces that every contract operation is fulfilled, the contract becomes a reviewable type, and it reuses the `VendorAdapter` pattern already in the codebase.

### The pattern

| Piece | What it is | Where it lives |
| --- | --- | --- |
| `WORKFLOW_NAMES` / `WorkflowName` | The workflows the framework offers, as an `as const` list and its derived type | `packages/core` (manifest validation needs the names) |
| `WorkflowAdapter<Operation>` | The generic interface every adapter implements, plus the pure readiness check | `packages/workflows/src/adapter.ts` |
| `<WORKFLOW>_OPERATIONS` / `<Workflow>Operation` | The workflow's contract: an `as const` list of operation names, its derived type, and a contract version | `packages/workflows/src/<workflow>.ts` |
| `<plugin>Adapter` | A frozen object implementing the interface for one plugin | Next to its contract |
| `WORKFLOWS` | The active adapter for each workflow, typed `Record<WorkflowName, …>` | `packages/workflows/src/index.ts` |

Each contract operation is also a framework skill users and agents invoke, at `plugins/unified-plugin-framework/skills/<operation>/SKILL.md`. The skill checks readiness and hands the work to the plugin skills the adapter names.

### Example

The generic interface, in `packages/workflows/src/adapter.ts`:

```ts
export interface PluginSkillRef {
  readonly plugin: string;
  readonly skill: string;
}

export type NonEmpty<A> = readonly [A, ...A[]];

/** Where a plugin records its own knowledge store: a JSON file in the project and the key holding the path. */
export interface PluginKnowledgeStore {
  readonly plugin: string;
  readonly file: string;
  readonly key: NonEmpty<string>;
}

export interface WorkflowAdapter<Operation extends string> {
  readonly workflow: WorkflowName;
  readonly contractVersion: string;
  readonly fulfil: Readonly<Record<Operation, NonEmpty<PluginSkillRef>>>;
  readonly knowledgeStores: readonly PluginKnowledgeStore[];
}
```

A contract and its implementation, in `packages/workflows/src/code-review.ts`:

```ts
export const CODE_REVIEW_OPERATIONS = Object.freeze(["review-task", "review-story", "review-feature"] as const);
export type CodeReviewOperation = (typeof CODE_REVIEW_OPERATIONS)[number];
export const CODE_REVIEW_CONTRACT_VERSION = "1.0.0";
export type CodeReviewAdapter = WorkflowAdapter<CodeReviewOperation>;

const TOOLKIT = "monolithic-code-review-toolkit";
const toolkit = (skill: string): PluginSkillRef => Object.freeze({ plugin: TOOLKIT, skill });

export const reviewToolkitAdapter: CodeReviewAdapter = Object.freeze({
  workflow: "code-review",
  contractVersion: CODE_REVIEW_CONTRACT_VERSION,
  fulfil: Object.freeze({
    "review-task": Object.freeze([toolkit("review-task")] as const),
    "review-story": Object.freeze([toolkit("review-story-preflight"), toolkit("review-story-postflight")] as const),
    "review-feature": Object.freeze([toolkit("review-feature")] as const),
  }),
  knowledgeStores: Object.freeze([
    Object.freeze({ plugin: TOOLKIT, file: ".monolithic-code-review/sources.json", key: ["knowledge", "root"] as const }),
  ]),
});
```

Each of these is a compile error: leaving out `"review-feature"`, adding an operation outside the contract, an empty list for an operation, a workflow name outside `WORKFLOW_NAMES`, and a `WORKFLOWS` registry that misses a workflow. `packages/workflows/test/contract.typecheck.ts` proves the first four.

### Rules

1. A contract changes only by a deliberate `contractVersion` bump. A plugin upgrade or replacement never changes it.
2. Contracts and workflow names are `as const` lists with derived types, so each is written once.
3. Adapters are frozen data. They hold no state and perform no I/O.
4. `fulfil` is total and non-empty over the contract, enforced by the type.
5. A plugin that keeps its own knowledge store declares where in `knowledgeStores`. Readiness requires every such store to equal the project's store.
6. Every plugin an adapter references is declared in the framework manifest's `onboardedPlugins` for that workflow.
7. Readiness is a pure function over an adapter and observed facts. File and host reads happen at the command-line boundary, through injected effects.
8. Each contract operation has a framework skill file naming the plugin skills and store setting it relies on; a test enforces that they match the adapter.
9. Share code between adapters only once two adapters exist and show what they have in common.

### Consequences
- **Positive:** Missing, extra or empty operations and unknown workflow names are compile errors. The contract is a type that code review can read. Readiness and upgrade checks are unit-testable.
- **Negative / Trade-Offs:** A new workflow needs a TypeScript change, not just a data file. Swapping a plugin touches the adapter object, the framework manifest entry, and the plugin names in the operation's skill files; tests catch any of these left out of step.
- **Follow-Up Actions:**
  - [ ] [AGE-70](https://linear.app/agentical-monolithics/issue/AGE-70/pin-onboarded-plugin-versions-and-check-upgrades-against-adapter-tests): use the adapter readiness check as the upgrade gate.
  - [ ] [AGE-93](https://linear.app/agentical-monolithics/issue/AGE-93/discovery-workflow-adapter-superpowers-and-bmad-method): implement the Discovery contract with this pattern, then extract anything the two adapters share.

## 5. Pros and Cons of Options

### Typed interface with frozen implementations
- **Good:** Compile-time completeness; explicit, versioned contract; matches `VendorAdapter`; pure and testable.
- **Bad:** Changing an adapter needs a rebuild.

### JSON mapping file read at runtime
- **Good:** Adapters can change without a rebuild.
- **Bad:** Completeness is checked only at runtime, the contract has no type, and it duplicates validation the compiler gives for free.

### Contract in skill prose only
- **Good:** Nothing to build.
- **Bad:** Nothing can check it. Readiness and upgrade checks have no data to work from.

## 6. Links & References

- [Workflow adapter architecture](../work-items/2026-11-15-workflow-adapter-architecture.md)
- [Code review workflow](../workflows/code-review.md)
- `VENDOR_IDS`, `VendorAdapter` and its registry: `packages/compiler/src/index.ts`
- Host adapter implementation: `packages/adapter-claude/src/index.ts`

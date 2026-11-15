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

The inherited toolkit already solves the same problem in the other direction. Host adapters implement the frozen `VendorAdapter` interface in `packages/compiler`, and a `Record<VendorId, VendorAdapter>` registry makes a missing host a type error.

Plugins mostly offer skills, which the model runs, rather than functions the code calls. An adapter therefore maps operations to plugin skills; it does not wrap function calls.

## 2. Decision Drivers

- The contract must be explicit, versioned and stable when a plugin changes.
- An adapter that misses a contract operation must fail at compile time, not when a user runs it.
- Swapping a plugin must be a local change: one new adapter object.
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

Three pieces, each with one home:

| Piece | What it is | Where it lives |
| --- | --- | --- |
| `WorkflowAdapter<Operation>` | The generic interface every adapter implements | `packages/core` |
| `<Workflow>Operation` | The workflow's contract: a union of operation names, plus a contract version | `packages/workflows/src/<workflow>.ts` |
| `<plugin>Adapter` | A frozen object implementing the interface for one plugin | Next to its contract |

Each contract operation is also a framework skill users and agents invoke, at `plugins/unified-plugin-framework/skills/<operation>/SKILL.md`. The skill checks readiness and hands the work to the plugin skills the adapter names.

### Example

The generic interface, in `packages/core`:

```ts
/** A plugin skill that carries out part of a contract operation. */
export interface PluginSkillRef {
  readonly plugin: string;
  readonly skill: string;
}

/** A workflow's adapter: its contract version and how plugins fulfil each operation. */
export interface WorkflowAdapter<Operation extends string> {
  readonly workflow: string;
  readonly contractVersion: string;
  readonly fulfil: Readonly<Record<Operation, readonly PluginSkillRef[]>>;
}
```

A contract and its implementation, in `packages/workflows/src/code-review.ts`:

```ts
/** The code review workflow's contract with users and agents. */
export type CodeReviewOperation = "review-task" | "review-story" | "review-feature";

export const CODE_REVIEW_OPERATIONS: readonly CodeReviewOperation[] = [
  "review-task",
  "review-story",
  "review-feature",
];

export type CodeReviewAdapter = WorkflowAdapter<CodeReviewOperation>;

const toolkit = (skill: string): PluginSkillRef => ({ plugin: "monolithic-code-review-toolkit", skill });

/** Code review fulfilled by the Monolithic Code Review Toolkit. */
export const reviewToolkitAdapter: CodeReviewAdapter = Object.freeze({
  workflow: "code-review",
  contractVersion: "1.0.0",
  fulfil: Object.freeze({
    "review-task": [toolkit("review-task")],
    "review-story": [toolkit("review-story-preflight"), toolkit("review-story-postflight")],
    "review-feature": [toolkit("review-feature")],
  }),
});
```

Deleting `"review-feature"` from `fulfil` is a compile error. To replace the toolkit, write another `CodeReviewAdapter` that points at the new plugin's skills; `CodeReviewOperation` and the framework skills stay the same.

### Rules

1. A contract changes only by a deliberate `contractVersion` bump. A plugin upgrade or replacement never changes it.
2. Adapters are frozen data. They hold no state and perform no I/O.
3. `fulfil` is total over the contract. Each operation lists at least one plugin skill.
4. Every plugin an adapter references is declared in the framework manifest's `onboardedPlugins` for that workflow.
5. Readiness is checked by a pure function over an adapter and observed facts (declared plugins, installed skills, knowledge store configuration). File and host reads happen at the command-line boundary.
6. Each contract operation has a matching framework skill file, and a test enforces it.
7. Share code between adapters only once two adapters exist and show what they have in common.

### Consequences
- **Positive:** A missing operation is caught by the compiler. The contract is a type that code review can read. Plugin swaps are one new object, and readiness and upgrade checks are unit-testable.
- **Negative / Trade-Offs:** A new workflow needs a TypeScript change, not just a data file. The list of known workflow names in `packages/core` must stay in step with the adapters; a test enforces it.
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
- `VendorAdapter` interface and registry: `packages/compiler/src/index.ts`
- Host adapter implementation: `packages/adapter-claude/src/index.ts`

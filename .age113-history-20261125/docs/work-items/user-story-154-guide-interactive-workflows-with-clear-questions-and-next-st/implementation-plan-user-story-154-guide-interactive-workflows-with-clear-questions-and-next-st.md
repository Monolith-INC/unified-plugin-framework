---
type: implementation-plan
feature: null
story: AGE-154
source_digest: c2673895a6dff833f99865146b48925cc353740367fe5fe5e7477ab5cf3b2ae3
skill: generate-breakdown-work-items
language: en
destination: linear
status: active
created: 2026-11-22
---

# Implementation plan: guided interactive workflows

AGE-154 is a parentless story by explicit user direction. It has seven existing Linear child tasks; deliver one through the repository's closeout process before starting the next. The original detailed scope and contracts remain in [the guided interaction plan](../2026-11-21-interaction-guidance-story-and-plan.md). Preserve the existing AGE-113 follow-up and use a single authoritative checkout for each delivery.

## Acceptance criteria coverage

1. **Fixed-choice questions, fallbacks, custom answers and consent follow the expected behavior across supported host capabilities.** AGE-156 reuses the existing question model and verifies channel suitability, custom answers, cancellation and consent.
2. **Codex project question configuration preserves explicit choices, unrelated settings and trust; unattended decisions yield needs-input when no reply channel exists.** AGE-155 adds explicit setup opt-in, safe configuration editing and no-reply-channel behavior; AGE-156 and AGE-158 extend the shared contract where applicable.
3. **Discovery directions and the next step are determined from the current state and explicit facts or events, including invalid and missing inputs.** AGE-157 models discovery directions; AGE-158 resolves the next node and its predetermined guidance.
4. **Interactive transitions and the recurring-question catalog use the shared workflow contracts.** AGE-159 composes immutable interaction transitions with the storyboard; AGE-160 extracts recurring questions into the existing model.
5. **Artifact, choice and review blueprints have a readable fallback; review decisions refer to the revision shown.** AGE-161 delivers reusable blueprints and verifies installed output, custom answers and revision-bound reviews.
6. **Guidance can be paused, resumes safely, and does not trap a session when local state is missing or invalid.** AGE-157 through AGE-159 cover waiting, invalid events, recovery and pause/resume without duplicate effects.
7. **The seven increments are delivered in the recorded order, with AGE-155 first; existing dependency source files remain unchanged.** Complete the tasks below sequentially and verify dependency-source preservation at each delivery.

## Delivery steps

1. **AGE-155 — Codex project question configuration.** Reconcile the copied AGE-113 work; add default-off explicit consent to setup. Preserve existing true and false, unrelated TOML and project trust. Parse a confined regular-file snapshot, make only a minimal edit that can be verified, and compare before replacement; return a recoverable result for invalid or unsupported input, unsafe paths and concurrent changes. Check unusual TOML, reruns, trust, session behavior and noninteractive decisions. Locate the existing continuation boundary rather than introduce another state store.
2. **AGE-156 — Native questions and safe fallback.** Route fixed choices by host and question capability; preserve custom answers, numbered text fallback, safe cancellation and explicit consent. Reuse AGE-113.
3. **AGE-157 — Discovery storyboard.** Model the discovery route and valid directions once; validate references, reachability and post-elicitation directions.
4. **AGE-158 — Next workflow action.** Resolve current node, facts and events to exactly one node and its predetermined, context-filled guidance. Test missing or conflicting inputs, idle, waiting, completion and pause/resume.
5. **AGE-159 — Pure interactive reducers.** Compose immutable elicitation state and typed failures into the storyboard's single transition owner. Test valid, invalid, repeated and late events without duplicating state or effects.
6. **AGE-160 — Recurring question catalog.** Extract only questions used by the implemented flow into the existing question model. Verify identifiers, substitutions, saved language and host rendering.
7. **AGE-161 — Host-agnostic blueprints.** Provide artifact, choice and review blueprints with accessible fallbacks; verify installed skill assembly, representative filled examples, custom answers and review revision binding.

## Verification and delivery

For each task, run focused behavioral tests against compiled JavaScript without TypeScript checking during test execution. Record host version, trust, session and noninteractive evidence where unit tests cannot prove behavior. Before push, run the repository's full checks once, with type checking separate from tests; include relevant payload, specification and hook checks. Preserve unrelated changes and dependency sources. Apply the repository's required review and PR closeout process. Before closing AGE-154, perform the scoped correctness, security and specification review required by the existing plan.

Staging, Review and Breakdown are accounted for during task decomposition. The seven child tasks already exist; do not create duplicates.

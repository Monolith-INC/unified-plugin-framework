# Guided interaction: user story and implementation plan

Status: draft for implementation, 2026-11-21. Sources: [owner priorities](../owner-suggested-mdh-borrowed-ideas-priorities.md), [host tools](../host-interaction-tools.md), and [harness research](../monolithic-dev-harness-patterns.md). This focused plan supersedes the broader unapproved guidance plan for these seven priorities; it does not delete that draft.

## User story

As a person working with a UPF agent, I want clear questions, visible work before decisions, and a useful next step in an interactive workflow, so that I can steer the work without repeated explanations or unnecessary ceremony.

### Acceptance

- Fixed-choice questions use a host control only when it supports the question and decision type; otherwise a numbered text fallback preserves custom answers. Account for single-choice-only hosts and optional-only prompts. Open questions remain open. Dismissal, acknowledgment or ambiguous input is not affirmative consent; required approval must be obtained before the associated effect.
- Codex setup can enable its project question feature without changing an explicit user choice or unrelated configuration. When structured input is unavailable, use text only if a reply channel exists; otherwise yield a needs-input result.
- A discovery storyboard identifies the current step and valid directions, including choices after elicitation. `next` deterministically resolves the current node and explicit facts or event to exactly one next node and its predetermined, context-resolved guidance. It does not ask the agent to choose a path or look up instructions. A decision node may present choices to the user; their answer is an event for the next evaluation. Missing or conflicting facts resolve to a specific recovery or information-gathering node; waiting and terminal nodes do not advance without the required event.
- Interactive transitions are deterministic and reject invalid events as values. A small catalog supplies recurring questions without inventing a second question transport.
- Host-agnostic canvas blueprints describe layout, content placeholders and intended controls for artifacts, choices and reviews. The agent fills them using the host's available presentation capabilities, with an accessible readable fallback when an interactive canvas is unavailable. Templates do not own workflow state or decisions.
- Before asking for a decision on work that can be shown, the review canvas presents the actual result or an accessible link and enough context to assess it. Bind the decision to the version shown and present material changes again before accepting approval. Do not manufacture approval gates or show unrelated material.
- Guidance is bounded and can be paused; missing or invalid local state never traps a session. Tests cover transitions, fallback and recovery. The existing dependency sources remain unchanged.

## Delivery slices

One parent story with the following seven sub-tickets, in order; implement one ticket through delivery before starting another. Each ticket should reuse existing behavior and ship only the smallest independently useful increment. Later tickets may consume earlier interfaces; no new state store, hook, command or renderer is justified merely by the plan.

| Order | Sub-ticket | Scope and completion evidence |
|---|---|---|
| 1 | Codex project configuration | Integrate `[features] default_mode_request_user_input = true` in `.codex/config.toml` with host setup as an explicit opt-in, preserving TOML semantics, explicit `false`, unrelated settings and trust. Test missing, existing, disabled, unusual valid TOML and unsafe paths. Verify actual host behavior and document trust/session limits. |
| 2 | Ask the user | Extend the existing question model and shared host guidance only where needed; verify native and numbered fallback, custom answers, host limits, cancellation, and consent. Reuse AGE-113 rather than duplicate it. |
| 3 | Storyboard | Model the discovery route and its valid directions once, grounded in the existing workflow. Validate references and reachability; demonstrate the post-elicitation directions. Start with discovery only. |
| 4 | `next` | Implement a pure, exhaustive transition from current node plus explicit facts or event to exactly one next node, with its predetermined guidance dictionary entry resolved using only relevant context. Use the smallest existing entry point agents can invoke. Cover decision answers, idle, waiting, completion, pause/resume and missing, conflicting or invalid state; define state updates before persistence or automation. |
| 5 | Pure interactive reducers | Implement the elicitation transitions using immutable inputs and explicit failure values; test valid and invalid transitions and connect them to the storyboard without duplicating state. |
| 6 | Question catalog | Extract recurring questions used by the implemented flow into one typed catalog, using the existing question model and saved language rules. Test IDs, substitutions and host rendering; avoid speculative translations and unused questions. |
| 7 | Host-agnostic canvas blueprints | Provide a small set of reusable artifact, choice and review blueprints with placeholders for content and controls. Instruct agents when to use each and adapt it to available host capabilities, with a readable fallback. Connect workflow guidance to the appropriate blueprint without duplicating state. Verify filled examples for plans, work items and multi-option questions, including custom answers; in reviews show the version to be approved and re-present material changes, without extra approvals. |

Dependencies are practical rather than architectural mandates: identify the smallest shared interfaces during each ticket, and adjust order only where needed to keep a slice useful. A one-shot stop nudge or host hook is optional follow-up, not a prerequisite; only add one if verified host support and a concrete need justify it. Any such guidance must have a tested escape and loop guard. The separate fresh-test-copy idea is outside the owner's seven-item scope.

## Implementation contracts

### Transition ownership (slices 3–5)

One pure storyboard reducer owns event validation and target selection. `next(state, facts, event?)` delegates to it and resolves its outcome to exactly one node and the relevant, filled guidance entry; it does not maintain a second transition table. The elicitation reducer owns only its internal selection state and is composed by the storyboard reducer, not a competing workflow transition.

Identify a pending decision by its session and step occurrence, not its reusable catalog ID; include the artifact revision for a review. A malformed current answer preserves state and resolves to one correction; a stale or duplicate answer preserves the current state and pending decision. No answer remains waiting. Evaluation is pure: the boundary presents a prompt on node entry or explicit retry, not every time `next` is read. Test valid, invalid, repeated and late answers, revisiting a decision, terminal state, and repeated evaluation without duplicated prompts or effects.

### Decision channel and unattended execution (slices 1, 2, 4, 7)

Select exactly one answer channel for each decision based on session capabilities and question type. Prefer a suitable native control with an informational canvas; use an interactive canvas only if its callback supports the complete answer, custom text and consent. Otherwise use numbered text when a reply channel exists. Normalize each channel's response to the decision instance and stable option keys, literal custom text and explicit consent outcome as applicable. Decode numbers against displayed order, including recommended-option reordering. Display, dismissal or a default is not affirmative consent. Test equivalent events across supported channels, multi-select, reordered choices, custom text, cancellation and duplicate callbacks.

When no reply channel exists, return `needs-input` with the pending decision reference, resolved question, permitted answer forms, review revision if relevant, and continuation state. Yield without reading stdin, polling or performing the protected action. Resume through the same reducer on an explicit matching answer. Carry continuation through the caller or existing session boundary where supported; do not introduce a daemon or store solely for this case. Test closed input returns promptly, repeated evaluation retains the pending decision and makes no protected calls, a valid answer advances once, and an obsolete review approval is rejected.

### Blueprint delivery (slice 7)

Define artifact, choice and review blueprints once, with semantic runtime slots for their content and intended controls. Put applicable guidance in the assembled skill so it survives installation; avoid runtime placeholders using the renderer's `{{...}}` build-token syntax. Verify real skill assembly, release bundling and host materialization in a fresh temporary project: inspect the installed `SKILL.md`, confirm the blueprint and runtime slots survive, and fill representative examples including a review revision. Keep the existing unknown build-token checks.

## Conformance and verification

- Preserve the [Agent Plugins 1.0.0 specification](https://agent-plugins.org/specification): root `plugin.json`, fixed `skills/` and `mcp.json` discovery, confined package paths, conformant skills, and namespaced client extensions. Host-specific configuration is host integration, not a new portable component or core manifest field. Check the normative requirements relevant to each changed file; do not claim whole-product conformance from a scoped review.
- During each ticket, run focused tests for the affected package and behavioral cases. Before push, run the repository's required full checks once, including payload verification and hook tests when applicable. `pnpm specs:verify` checks host-spec drift; it is not a substitute for reviewing normative Agent Plugins requirements. Record live host evidence where behavior cannot be proved by unit tests.
- Before closing the story, conduct one deep, scoped correctness, security and specification-compliance review of the changed files using thermo-nuclear-review with GPT-6.2 Astra, medium effort. Resolve valid findings in one round. The repository's separately required PR requirements review remains subject to its explicit posting confirmation rule.
- Follow the repository's ticket flow, protected-main PR and closeout process. Preserve existing changes and the current session. Do not treat creation of the plan as proof that implementation or conformance is complete.

## Current handoff

The checkout has uncommitted changes on `feature/AGE-113-host-interaction-controls`; AGE-113 is Done and its original implementation is in local main (PR #37). Preserve and classify the uncommitted follow-up, check the current session and PR status, and bind remaining work to the appropriate new child ticket. The three source notes are currently untracked; preserve them with the plan when shipping or make the plan independently traceable. Do not assume the older draft's claim that AGE-113 still needs merging is current.

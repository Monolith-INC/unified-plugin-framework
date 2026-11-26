---
title: 'Guided interaction discovery'
type: 'approach'
ticket: 'AGE-154'
created: '2026-11-22'
status: 'active'
route: 'full'
route_source: 'pinned'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** People need clear interaction and safe decision handling across host capabilities. Codex project setup currently lacks a safe explicit opt-in for its default-mode question feature.

**Approach:** Deliver the seven slices in the existing guided-interaction plan one at a time, beginning with AGE-155. Reuse the current host and question infrastructure, preserve existing work, and verify each slice independently.

## Boundaries & Constraints

**Always:** Preserve user settings, explicit choices, trust, dependency sources and unrelated work. Keep state transitions deterministic and effects at boundaries. In unattended execution, yield needs-input when no reply channel exists.

**Never:** Enable the Codex feature without explicit opt-in; silently change trust; treat cancellation as consent; add a duplicate question transport or state store; begin a later ticket before the current ticket is delivered.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Opt-in | No existing setting | Add the feature with a safe, verified edit | Preserve file and return a typed failure if unsafe |
| Existing choice | Explicit true or false | Preserve the choice on setup and reruns | Never overwrite the user's value |
| Decline or legacy plan | No opt-in | Keep existing configuration unchanged and setup usable | No feature write |
| Unsafe configuration | Invalid TOML, linked or nonregular path, or concurrent edit | Preserve the original and other targets | Return a recoverable result promptly |
| No response channel | Required decision in unattended execution | Return needs-input with continuation context | Do not wait for stdin or perform the protected action |

</frozen-after-approval>

## Discovery digest

AGE-154 describes seven sequential slices of guided interaction. The user selected AGE-155 first and approved implementation; the existing plan is `docs/work-items/2026-11-21-interaction-guidance-story-and-plan.md`. Preserve its later slices and the existing follow-up while delivering one ticket at a time. The earlier broad plan is superseded, not deleted.

The current checkout contains uncommitted AGE-113 follow-up. Its Codex registration writes the question feature unconditionally, and its regular expressions do not preserve TOML semantics for all valid layouts. The separate AGE-155 checkout holds a copy; the original is intact. A project knowledge lookup found only `project/harness-settings`, with no topic-specific units.

The AGE-155 setup option must be explicit, preserve existing settings and explicit false, avoid unsafe paths and trust changes, and distinguish an unavailable question control from an unavailable reply channel. Existing project rules require deferred effects, typed failures, scoped delivery and tests without TypeScript typechecking during test execution.

## Code Map

- `packages/cli/src/tooling-input.ts` and `packages/cli/scripts/installer-wizard.mjs`: accepted setup consent and user-facing choices.
- `packages/cli/src/host-table.ts` and `packages/cli/src/tooling-host.ts`: host registration and materialization; the existing follow-up currently applies configuration without opt-in.
- `packages/cli/src/host-specs.ts`: existing regular-expression TOML edit, requiring replacement or safe restriction.
- `packages/cli/src/tooling-files.ts`: existing TOML reader and compare-before-atomic-replace path protections; reuse where suitable.
- `packages/cli/test/host-table.test.mjs` and installer tests: existing narrow coverage; add semantic TOML, consent and unsafe-path cases.
- `packages/workflows/src/questions.ts`: separate uncommitted interaction-guidance changes, to preserve and reconcile with the appropriate later slice.
- `docs/host-interaction-tools.md`: untracked host notes; validate claims against actual host evidence before publication.

## Tasks & Acceptance

**Execution:**

- [ ] `docs/work-items/2026-11-21-interaction-guidance-story-and-plan.md` — retain the seven-slice sequence and classify the existing follow-up; deliver AGE-155 first.
- [ ] `packages/cli/src/tooling-input.ts` and `packages/cli/scripts/installer-wizard.mjs` — carry and present a default-off opt-in through the accepted setup plan.
- [ ] `packages/cli/src/host-specs.ts`, `host-table.ts`, `tooling-host.ts` and `tooling-files.ts` — plan a semantic, constrained configuration edit and execute it through protected file boundaries only when opted in.
- [ ] Existing question and continuation boundaries — distinguish no structured control from no reply channel and return a resumable needs-input result when necessary.
- [ ] `packages/cli/test/` and applicable workflow tests — cover the matrix, unusual TOML, safe paths, concurrent edits and idempotence.
- [ ] Host documentation — record trusted and untrusted projects, existing and new sessions, noninteractive behavior, supported version and any evidence gaps.

**Acceptance Criteria:**

- Given a user opts in, when Codex project setup runs, then the setting is enabled only when a safe edit is possible and no explicit choice already exists.
- Given no opt-in or an explicit existing value, when setup runs, then that choice and unrelated configuration remain unchanged.
- Given a required decision without a reply channel, when the caller evaluates it, then it yields needs-input without blocking or performing the protected action.
- Given the remaining parent slices, when work continues after AGE-155, then each slice reuses the existing contracts and is delivered separately.

## Design Notes

The accepted recommendation is to parse a safe snapshot, propose a minimal supported edit, parse and compare its result, then use a compare-before-replace boundary. Preserve the original bytes apart from the insertion; refuse a shape that cannot be edited safely. Semantic parsing alone does not ensure lossless editing.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Verification

- Run focused compiled-JavaScript tests without TypeScript typechecking during test execution; cover the acceptance and edge-case matrix.
- Verify live host behavior where available and record exact versions, conditions and limitations.
- Before push, run the project-required full checks once, with TypeScript checking separately from tests, plus relevant hook and payload checks.

## Accepted failure-mode findings

- Carry a default-off opt-in through registration; legacy and declined plans remain ready without changing Codex configuration.
- Parse and validate TOML edits semantically, preserve existing choices and unrelated content, and return a recoverable failure when a safe edit cannot be made.
- Reject linked or nonregular configuration paths and protect against concurrent edits with confined reads and compare-before-replace writes.
- When no reply channel is available, return needs-input without waiting on stdin or performing the protected action.
- Verify actual trust, session and noninteractive behavior separately from the feature flag, recording host version and observed limits.

## Accepted boundary cases

- Cover absent consent, decline and opt-in; missing files, explicit true and false, and idempotent reruns.
- Exercise quoted and dotted keys, inline tables, comments, multiline strings, CRLF, Unicode, dates and nonfinite TOML values. Unrelated keys and strings must not be mistaken for the feature.
- Preserve invalid TOML and valid shapes the editor cannot safely modify; explain how to recover.
- Test symlinks, directories, FIFOs, permissions and concurrent edits without blocking or altering other files.
- Check project trust, old and new sessions, noninteractive execution and safe treatment of absent or ambiguous answers.

## Accepted assumptions to verify

- The flag is under development in the observed Codex CLI 0.171.0; verify behavior for the supported host and do not infer availability across versions.
- Project configuration requires trust. Verify trusted and untrusted behavior without modifying trust; separately test an existing session and a new session.
- Semantic parsing alone does not guarantee a content-preserving edit. Verify the actual editor and refuse unsafe edits.
- Locate the existing continuation contract before adding needs-input; avoid a second workflow store.
- Classify the copied uncommitted follow-up by delivery slice and preserve the remainder.

## Accepted delivery risks

- Deliver AGE-155 first; preserve later-slice work and establish one authoritative implementation checkout before delivery.
- Explain observed host and trust limits without changing global settings or trust. Never treat defaults, dismissal or missing answers as consent.
- Record live-host evidence and verification limits; preserve dependency sources and verify affected assembly and release paths.

Standard planning depth was selected. All five selected analyses, including the architecture recommendation, were accepted.

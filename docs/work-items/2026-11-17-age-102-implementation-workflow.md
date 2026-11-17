# AGE-102: Implementation workflow

Date: 2026-11-17

Ticket: [AGE-102](https://linear.app/agentical-monolithics/issue/AGE-102/implementation-workflow-approved-work-to-verified-review-handoff)

Status: Implementation approved in chat. One branch, `feature/AGE-102-implementation-workflow`, cut from main at `032eb4156ed574cd042afd925dbc2cfd332b0e1f`.

## Outcome and contract v1

Take approved work from its implementation plan to verified changes and a review handoff. Resume existing work without repeating completed tasks or rebuilding the delivery process each session.

Workflow: `implementation`. Contract and template prose name neither a dependency plugin nor a tracker.

| Operation | Input | Outcome |
| --- | --- | --- |
| `implement-work` | Approved story or task scope, its plan and available progress/evidence | Execute unfinished authorized tasks, verify them proportionately, preserve progress and prepare the existing review handoff |
| `implement-verify` | Current change, acceptance criteria and project check policy | Establish requirement coverage, run missing verification, report remaining failures and produce a review-ready evidence summary |

Resumption uses `implement-work` again. A separate resume operation, feature-level executor and publication engine are unnecessary for this slice. An epic or feature without an implementable story/task plan goes to existing tracking/breakdown rather than generating another plan inside execution.

## Reuse the published execution method

Superpowers is already onboarded for Discovery. Its published `v7.0.0` resolves to commit `bb92a77741419a4ab5f06e711a283343f1ada0c3`. The inspected `executing-plans` skill explicitly supports inline execution without an implementer and reviewer per task. Its task loop supplies useful execution discipline; `verification-before-completion` supplies evidence-based completion checks; `systematic-debugging` supplies root-cause guidance when a check fails.

Sources: [inline execution](https://github.com/obra/superpowers/blob/v7.0.0/skills/executing-plans/SKILL.md), [verification](https://github.com/obra/superpowers/blob/v7.0.0/skills/verification-before-completion/SKILL.md), [debugging](https://github.com/obra/superpowers/blob/v7.0.0/skills/systematic-debugging/SKILL.md).

Use a reviewed content view, as tracking already does, instead of invoking the whole native conductor. The native instructions also mandate a worktree, helper-script workspace/ledger, testing/review cadence and a finishing menu. Those choices belong to the project. Select useful execution, verification and failure-diagnosis sections explicitly; preserve MIT attribution and pin every consumed source file. Do not rewrite dependency files or invoke unselected native follow-up skills/scripts.

The adapter maps `implement-work` to execution, verification and debugging content; `implement-verify` uses verification content. Project-specific guidance controls approvals, functional rules, branch policy and check depth. Inline execution is the default; sub-agents are used only when the project or user requests them. Progress references the existing plan and Continuity journal, without adding a second ledger engine.

## Delivery behavior

1. Read the work item and linked plan through project operations, plus current checkout/diff and relevant shared knowledge. Reuse project language, document location and completed setup. Missing adapter capability follows the existing bootstrap recovery, not a recurring per-skill interview.
2. Confirm that the requested scope has implementation authorization. Historical approvals in session records are evidence, not fresh permission. Ask only for missing decisions that change authorized work; do not treat every routine implementation choice as a new approval gate.
3. Follow the project's branch policy. For this repository: one branch from main, finish it before the next, no extra worktree. Preserve unrelated edits. A different project's saved policy controls its own workflow.
4. Restore existing progress and verify it against current evidence. For each unfinished task, record its start through the existing Continuity operation, make the smallest required change, run its focused checks and record the observed result. Use meaningful test-first work where appropriate; do not invent tests for trivial prose or reversible low-impact edits.
5. On a failing check, use the selected debugging method: reproduce, identify the cause, correct and rerun the affected check. Preserve completed work. A scope-changing ambiguity returns to the user; a routine recoverable failure follows its recovery without restarting the whole workflow.
6. At completion, map each acceptance criterion to evidence or an explicit gap. Apply the project's final checks and review policy once to the current code. Evidence can be reused when its relevant code has not changed; do not claim a historical run validates later changes.
7. Prepare the existing review operation appropriate to the task/story/feature, with scope, base/head, relevant artifacts, checks and unresolved limits. Reuse existing project publication bindings and approvals when available. Missing SCM capability has a concrete recovery; this card does not add an SCM adapter or claim a PR, merge or tracker completion occurred merely because a handoff was prepared.

Work-item reads, state changes and artifacts stay behind `project-operations`. Resolve an uncertain write before replaying it. Session checkpoint failure reports degraded persistence and does not stop coding. Published work, merges, deletions and irreversible operations follow the project's existing authorization rules.

## Necessary shared-dependency support

Current manifest declarations and lock entries assign one plugin to one workflow. Discovery and implementation must share one Superpowers source/version, while keeping separate contract and mapping evidence. Do not introduce an alias plugin or copy its implementation to avoid that constraint.

Normalize legacy single-workflow declarations/pins and the new shared form through one parser path. Retain one authoritative plugin source/version identity and a binding for each consuming workflow. Each binding records its contract version, mapping digest and consumed public-file evidence. Re-pinning one mapping preserves the others; changing source/version must not silently leave other bindings marked checked against the replacement. Reuse existing upgrade-check to verify affected mappings or leave a specific recovery for the unchecked binding.

Use the underlying plugin checksum as shared source identity. Reviewed content references can differ by workflow, so an adapter-specific selection digest must not masquerade as a different installed plugin. Preserve the existing same-version source-drift rejection and prior consumed-file checks. Reject duplicate/conflicting source declarations and bindings. Existing single-workflow configurations remain readable; writing a newer lock format has an explicit version and migration diagnostic rather than silently reinterpreting an old file.

Tooling setup still installs and verifies one active source tree. Selecting implementation must retain existing Discovery marketplace entries and readiness. This is support for the two real consumers, not a new dependency-resolution or update service.

## Work sequence and verification

1. Add the shared binding representation and compatibility parser, then adapt existing declaration lookup, pinning and readiness consumers. Focused regressions prove unchanged legacy behavior, one source serving both workflows, mapping-specific drift and pin updates that preserve the other binding.
2. Register the typed implementation contract and frozen content adapter. Make content rendering usable by both tracking and implementation, with each workflow's instructions remaining in its own contract/protocol. Preserve tracking behavior and re-pin any mapping changed by that support. Reuse the existing content-selection implementation and its missing/changed-section failures.
3. Add the two plugin-free templates with the execution/handoff behavior above. Reuse project operations, shared knowledge, Continuity and review; no native tracker calls, mandatory worktree or automatic publication. Include recovery when one of those capabilities is unavailable.
4. Bind the clean published source, regenerate all host payloads and documented digests, and update the user journey and workflow documentation.
5. Use the installed Codex files on a small approved temporary story/task: execute and verify a real change, save progress, resume without repeating completed work and prepare the existing review handoff. Exercise a failing check/recovery and missing-capability path. Separately show Discovery remains usable with the same active dependency source. Distinguish explicit skill execution from automatic host invocation.
6. Run one scoped correctness/maintainability pass. Apply findings together, then run the full clean-clone checks under umask 022 once before publication. The open PR gets one requirements review. Obtain chat approval before push, posting and merge; close this card and remove its branch before the next.

The one card includes the shared-binding prerequisite because implementation cannot safely reuse the existing dependency without it.

## Verification evidence

One correctness and maintainability review found the same adopted-version inference regression in both passes: a manifest-less content dependency lost its accepted version after migration from a selection checksum to the shared source checksum. Version inference now uses the same canonical source identity as binding migration. A focused regression preserves the adopted version across migration and selection growth while refusing to infer it from different source bytes.

Focused workflow tests verify shared source identity, per-workflow mapping drift, unchanged legacy locks, approval invalidation on a new release, conflicting declarations/bindings, public-file drift and complete implementation content. Existing core, adapter, upgrade, tooling and installed-payload checks passed during development.

An installed-file walkthrough in a temporary project used an isolated trusted Codex home and the existing project bootstrap. Fresh discovery and active-content checks passed for implementation, Discovery, Continuity and review, sharing one Superpowers source. A two-task greeting fixture observed failing checks, fixed them and passed both acceptance tests. It saved task progress, resumed in a new chat without repeating the completed first task, prepared the existing review handoff and replayed artifact publication without duplicates. The fixture's story remained in progress; it had no SCM setup, so no remote review, PR, merge or story completion was claimed. Repeated bootstrap after execution verified unchanged installed source bytes. No extra worktree or second ledger was created.

This proves installed files and explicit operation boundaries, not an autonomous model turn or automatic host invocation. The full clean-clone suite is the final publication gate.

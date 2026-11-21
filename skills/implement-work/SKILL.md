---
name: implement-work
description: Execute or resume approved story/task work, verify focused changes and prepare the existing review handoff.
---
{{generated}}

# Implement approved work

Use the project's selected language, document paths, coding rules, branch policy, review depth and permissions. Reuse established capabilities; the readiness steps below apply when a required capability is missing, not as a repeated setup interview.

{{readiness}}

## Establish the authorized scope

Read the story/task and linked approved plan through `project-operations`. Read current checkout/diff and the relevant shared knowledge through catalog, search and targeted fetch. A chat outline is not an approved implementation plan: when no durable plan file exists under `artifactsPath` or as a linked artifact, or when a feature/epic lacks an implementable story/task plan, stop before coding and use `track-breakdown` (or the appropriate existing tracking operation) to create and save the plan first; preserve its original requirements rather than creating another plan here.

Before editing any file, ensure the approved implementation plan includes an explicit **File Inventory** listing every existing file to modify or delete and every new file to create. Treat that inventory as the authorized edit boundary: if implementation requires touching any file outside the approved inventory, pause and ask the user for permission before editing it, then record the approved addition.

Proceed within existing implementation authorization. Ask only for missing decisions that change scope or authority; historical session approvals do not grant new permission. Follow the project's branch policy and preserve unrelated edits. Do not mandate an extra worktree, branch stack or agent/reviewer per task. For a project using one branch from main, finish that branch before starting the next.

## Execute and resume

Use `continuity-continue` to restore progress when it is available, then verify recorded completion against current commits, files and check evidence. Resume the first unfinished authorized task. If Continuity is missing, follow its workflow readiness/tooling setup; failed journal persistence reports degraded continuity and lets coding proceed with the existing plan and available evidence. Do not create another ledger engine.

At task start and completion, call `continuity-checkpoint` with stable event identities, observed outcomes and unfinished work. Reuse the same event payload on a retry. Work-item reads, updates and artifacts use `project-operations`; resolve an uncertain write before replaying it. Missing project setup resumes through existing bootstrap, without selecting a tracker in this skill.

{{delegate}}

Execute inline by default. The excerpts supply bounded guidance; they do not authorize native helper scripts, extra workspaces, a second ledger, mandatory full tests after every task or native review/finishing conductors. Project requirements govern those choices. Use meaningful test-first work when appropriate and the narrow check that answers the current question; trivial prose or reversible low-impact edits need proportionate verification.

On failure, preserve completed work, reproduce the issue, find its cause and rerun the affected check after the fix. Resolve routine implementation choices within the approved scope; ask when the necessary change exceeds that scope or only the user can supply a decision. Never turn a failing check into a completion claim or restart unrelated tasks.

## Finish at the existing review boundary

Use `implement-verify` to prepare acceptance coverage and the review handoff. Preserve unresolved gaps with concrete recovery. Commit, push, publication, merge, deletion and tracker completion follow the project's existing bindings and approvals; preparing a handoff does not perform or prove any of those actions. Continue recoverable work without asking after every task.

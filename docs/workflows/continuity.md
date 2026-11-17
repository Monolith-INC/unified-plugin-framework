# Continuity

Continuity restores project orientation, decisions, evidence and unfinished work between sessions. Its three operations share one adapter and one dependency-owned session implementation:

| Operation | Result |
| --- | --- |
| `continuity-continue` | Start or resume the chat's session; a new chat picks up the latest readable context in the same checkout |
| `continuity-checkpoint` | Save observed progress once at a meaningful event, retaining retry identities |
| `continuity-recover` | Resume from readable evidence while preserving damaged records and identifying missing history |

The adapter maps these outcomes to Agent Continuity's `session-continue`, `session-checkpoint` and `session-recover` skills. The dependency owns the journal runtime; the framework owns project choices, workflow routing and the shared knowledge integration. The dependency is pinned to [v0.13.0](https://github.com/Monolith-INC/agent-continuity/releases/tag/v0.13.0), commit `39de006e0aa8cca9361d9cdc1de3a15ba816a8a5`.

## Project setup

Reuse the project's saved language, document location and shared knowledge store. The journal location is `continuity.journalRoot` in `.unified-plugin-framework.json`. When missing, bootstrap proposes `<artifactsPath>/sessions` with the other missing choices and saves the accepted path through the existing project settings service. Existing journals and unrelated choices are preserved.

Tooling bootstrap selects the `continuity` workflow and a clean pinned dependency root. It stages the unmodified source, activates its skills through the existing host integration and verifies the discovered content. No additional installer, Python package or Obsidian application is required by the session runtime. Local journals do not require live tracker authentication. All work-item reads or updates still use project operations.

Establish capabilities once at session entry and reuse them. Missing setup or a failed operation resumes its specific recovery; checkpoints do not poll bootstrap before every skill.

## Saving and resuming

Use the host's stable chat identity and the actual checkout path. Each chat has its own session chain. A new chat seeds from the latest readable session in that checkout without closing or changing another chat's records. Historical approvals are evidence, not new execution authority; verify current work state from authoritative sources.

The seven checkpoint kinds cover first successful edit to each file per session, commit, rollback/amendment, task start/end, push, completed review and session end. Record observed results and source references. Replayed events retain their identity and payload; a suppressed repeated file edit retains a compact receipt without duplicating progress.

After eight elapsed hours, including idle time, the next operation closes the old session at its recorded expiry and creates one linked continuation carrying unfinished work. A stopped host cannot run a timer, so actual creation can occur later. It never invents activity or empty sessions for idle intervals.

Unreadable records remain intact. Recovery uses the last readable evidence, or starts fresh with an explicit missing-history diagnostic. Locks and atomic replacement protect writes; a failed save reports its recovery and lets the task continue. Journals link to authoritative documents and shared project knowledge rather than duplicating that store.

## What is verified separately

These operations are explicitly invokable. Installing them or discovering their names does not establish automatic session entry or capture of host events. Each automatic entry point needs an observed host integration; otherwise invoke the relevant operation explicitly. Session archival and source-driven knowledge incorporation remain separate delivery work.

See the [AGE-97 plan](../work-items/2026-11-17-age-97-continuity-adapter.md) for ownership, delivery order and verification evidence.

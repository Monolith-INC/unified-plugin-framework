# Implementation

Implementation takes an approved story/task plan to verified code and the existing review workflow. It has two operations:

| Operation | Result |
| --- | --- |
| `implement-work` | Execute or resume unfinished authorized tasks, check each change and preserve progress |
| `implement-verify` | Map acceptance criteria to evidence, perform required verification and prepare a scoped review handoff |

The adapter reuses reviewed execution, verification and debugging guidance from Superpowers 7.0.0. It uses selected content rather than the native conductor's workspace, ledger and finishing machinery. Original dependency files remain unchanged. The project decides branch policy, permissions, check depth and review cadence.

Start from the authoritative work item and linked plan through project operations. Reuse the saved language, document locations and shared knowledge store. If the scope is still an epic/feature without implementable tasks, use existing tracking/breakdown first. Missing project choices resume through existing bootstrap; workflow skills do not choose a tracker or repeat its setup interview.

Execute inline by default and follow the project's branch rules. For a project using one branch from main, complete that branch before starting another; an extra worktree is not required. Use meaningful test-first work where appropriate, focused checks during development and final checks at the project's publication boundary. Reuse evidence only while its relevant inputs remain unchanged.

Continuity restores saved progress and records task start/end and verification outcomes. Check saved completion against current evidence before skipping work. A journal failure reports its recovery and lets coding continue using the plan; implementation does not create a second ledger. An uncertain work-item write is resolved through project operations before it is replayed.

Verification produces acceptance coverage, change/base/head references, commands and results, and any unresolved limits. It invokes the existing task/story/feature review operation at the appropriate scope, without repeating an already completed review of unchanged work. Publication, merge, deletion and tracker completion follow project authorization; preparing a handoff does not claim those actions happened. Missing review/SCM capability has a recovery rather than a new provider implementation.

## One dependency, two workflows

Discovery and implementation share one Superpowers source/version and retain separate mapping checks. A declaration can use `"adapter": ["discovery", "implementation"]`; the existing string form remains valid. Plugin names remain unique.

Lock version 2 stores a single underlying source checksum and independently checked `bindings` for each consuming workflow, including its contract, mapping digest and consumed public-file digests. Legacy version 1 locks remain readable and migrate when a shared binding is written. An unsupported/malformed lock is preserved with a compatible-version or re-pin recovery.

Re-pinning a mapping preserves other bindings against the same source. Adopting a different source/version does not inherit their old approvals: readiness names the missing binding and its upgrade-check recovery. Previously consumed files remain checked even if a later selection omits them. Tooling installs one source tree and preserves existing marketplace entries.

See the [AGE-102 plan](../work-items/2026-11-17-age-102-implementation-workflow.md) for delivery and qualification.

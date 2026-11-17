# AGE-97: Continuity contract and delivery plan

Date: 2026-11-17

Ticket: [AGE-97](https://linear.app/agentical-monolithics/issue/AGE-97/continuity-workflow-adapter-agent-continuity)

Status: Implementation approved in chat, including the upstream Agent Continuity work. Framework branch: `feature/AGE-97-continuity-adapter`, cut from main at `25a2579`.

## Outcome

Resume with the project's orientation, decisions, evidence and unfinished work. Save progress at meaningful events without blocking the task. Recover from unreadable records without inventing decisions, approvals or completed work.

The existing [working design](unified-plugin-framework-draft-plan.md) and [follow-on scope, Plan C](2026-11-14-knowledge-follow-on-scope.md) already define the required session lifecycle. An adapter alone cannot deliver that lifecycle with the currently published dependency.

## Verified dependency boundary

Inspected Agent Continuity tag `v0.12.3`, commit `35480c47d54a867b31f0052f4b91ad62fe7690e1`:

| Published contribution | What it establishes | Limit |
| --- | --- | --- |
| `init-vault` and `archetypes/software-project.json` | Vault skeleton, orientation note and a directory for linked session journals | No session-record schema, checkpoint writer or lifecycle operations |
| `hooks/scripts/bootstrap.sh` | Injects configured orientation files at session start | Does not select or restore a checkpoint; missing files can produce a silent no-op |
| `query-vault` | Read-only queries, including recent sessions | Requires a running Obsidian application for its normal query path; supplies no continuation or recovery implementation |
| `hooks/hooks.json` | Orientation and document convention hooks | No capture of the seven agreed checkpoint events |

The inspected `main` is two commits ahead of this tag; its changed files concern packaging, branding and README content, with no added session lifecycle. No dependency code or installed plugin was modified. No runtime behavior was tested in this investigation.

Published sources: [skill inventory](https://github.com/Monolith-INC/agent-continuity/tree/v0.12.3/skills), [orientation hook](https://github.com/Monolith-INC/agent-continuity/blob/v0.12.3/hooks/scripts/bootstrap.sh), [hook registration](https://github.com/Monolith-INC/agent-continuity/blob/v0.12.3/hooks/hooks.json), [vault archetype](https://github.com/Monolith-INC/agent-continuity/blob/v0.12.3/archetypes/software-project.json).

The user also supplied `/home/monolith/projects/codex-workflows-plugin` as a reference. Its current checkout (`75c22f0`) restores delivery state from tracker artifacts and pull requests. Historical `scripts/policy/session_gate.py`, added in `2cca013` and removed in `adac58c`, demonstrates open-session detection, linked Markdown journals and an eight-hour age check. Reuse those concepts, while avoiding its write-blocking gate, branch-as-checkout identity and timestamp fallback to modification time or the current clock. Existing Markdown journals remain evidence to reference; this work does not silently migrate or overwrite them.

Its bootstrap also preserves project integration settings while replacing managed runtime files, and distinguishes saved configuration from capability verification. The framework already owns these behaviors through AGE-100/101; Continuity joins that existing setup flow rather than adding another installer or interview.

## Proposed contract v1

Workflow: `continuity`. These operation names and outcomes contain no plugin or tracker names.

| Operation | Input and outcome |
| --- | --- |
| `continuity-continue` | Given project/checkout identity and available session identity, restore the current readable session or start a linked continuation; return orientation, authoritative references and unfinished work |
| `continuity-checkpoint` | Given a stable event identity, event kind, observed outcome and progress evidence, persist that progress once and return a reference or a recoverable failure |
| `continuity-recover` | Given an unreadable or missing record, preserve it and resume from the last readable record with a diagnostic; if none exists, start from available project context and identify the missing history |

Continuing includes starting the first session and closing/linking at the elapsed-time boundary. A separate setup operation is unnecessary: missing project choices use the existing bootstrap flow and resume the original request.

Each record needs stable session and event identities, checkout identity, start/expiry times, predecessor reference, progress, unfinished work, decisions and evidence references. Store source references rather than duplicating authoritative documents. Retrieved approvals are historical evidence and do not grant new execution authority.

Use the existing project settings for language and document location and the existing shared project knowledge store for durable knowledge. Session journals are operational evidence, not a replacement knowledge store. Reuse an existing journal location when configured; propose `<artifactsPath>/sessions` only when it is missing.

## Lifecycle and triggering

Carry forward the seven agreed event kinds: first code change to each file per session; commit added; commit rolled back or amended; task started or ended; successful push; review completed; and before session end. Record actual outcomes. A command being proposed or issued does not establish success.

Retries reuse their event identity. The same event cannot duplicate progress, and a partial write must leave the previous readable state recoverable. Keep filesystem/time/host effects at explicit boundaries; make transitions pure over supplied time, snapshots and events. Concurrent writes must detect conflicting state rather than overwrite it.

At eight elapsed hours, including idle time, close at the recorded expiry and create one linked continuation when execution is available. A stopped host cannot execute a timer; waking after several days must not fabricate activity or a chain of empty sessions.

Proposed concurrency default: each chat has its own session chain, linked to the same project. Branch names alone do not identify checkouts. Ask once when explicit evidence shows a changed checkout or intention; ordinary continuation asks nothing.

A new chat restores the most recently observed readable chain head in the same checkout as its initial context, linking to that source without modifying another chat. The accepted journal location is saved as `continuity.journalRoot` in the existing project settings file. A missing path is filled through the existing setup service rather than a separate Continuity configuration.

Run continuation at session entry where a host exposes a proven entry point; otherwise provide the explicit operation. Capture events through verified host boundaries or explicit workflow calls. Do not make every skill poll setup or scan the ledger. Qualify one host first and list unsupported automatic triggers honestly.

A failed save reports the affected event and recovery while work proceeds; retry it at the next available checkpoint. Persistence failure means continuity is degraded, not that the record was saved. Missing or mismatched dependencies use the existing adapter readiness and upgrade recovery.

## Ownership decision before implementation

**Recommended:** implement the missing public lifecycle operations in Agent Continuity, publish and verify a release, then bind those operations through one framework adapter. Its upstream layer supplies the journal behavior; the framework supplies project choices, shared-knowledge integration and host/workflow routing. This requires authorization to work in that separate repository before it can begin.

The alternative is a framework-owned session subsystem, with Agent Continuity contributing only vault/orientation guidance. That changes AGE-97 from an adapter into a lifecycle implementation. It requires an explicit ownership decision and an adjustment to the adapter design; mapping checkpoint or recovery to unrelated setup/query skills would falsely imply coverage.

## Delivery and evidence

1. Confirm lifecycle ownership and the proposed contract, concurrency default and first-record fallback. Update this single ticket's acceptance criteria to match the chosen boundary.
2. Deliver the lifecycle once at that boundary. Test eight-hour expiry, wake-up, event replay, first-edit deduplication, conflicting writes and missing/corrupt-record recovery through the same production flow with injected effects.
3. Add the typed total adapter and plugin-free templates. Declare the dependency, pin its actual public operations with `upgrade-check`, rebuild payloads and update their documented digests. Extend existing bootstrap/tooling registration only where the new workflow needs it.
4. Prove a fresh installed-host session restores recorded unfinished work; prove each claimed event source, language/location reuse and failure recovery. Do not treat installed files or a static walkthrough as proof of automatic capture.
5. Run one review pass sized to the behavior and the full clean-clone checks once before publishing. Ask before push and merge, then close the ticket and remove its branch before starting the next one.

Archive mechanics and knowledge incorporation/freshness remain the separately identified Plans D and B. AGE-97 must not claim those requirements are delivered. Retain session records during this work; the agreed ten-readable-session default does not by itself authorize cleanup.

## Evidence so far

The upstream implementation is `0.13.0`, reviewed head `226d85722f8a6614d58bb8072124f5b341fb42c6`, merged through [PR #3](https://github.com/Monolith-INC/agent-continuity/pull/3) as `39de006e0aa8cca9361d9cdc1de3a15ba816a8a5`. One correctness and maintainability pass identified four retry/recovery defects: cross-chat selection at tied rollover times, first explicit intention adoption, suppressed-edit retry receipts, and a recovery destination collision. Those findings were corrected together, with focused regressions. Installed-flow verification additionally found Python bytecode altering pinned skill contents; the public command now leaves its installed source unchanged, covered by a regression.

In a clean bundle clone under umask 022, all 23 lifecycle tests, three packaging tests, manifest/frontmatter validation and all three host marketplace builds passed. Optional `skills-ref` validation was unavailable. A separate invocation of the packaged Codex runtime restored unfinished work into a new chat, preserved a corrupted original while recovering, and repeated recovery without creating another session.

The framework integration review corrected setup instructions to name the consuming project explicitly and preserve sibling Continuity settings when submitting the existing shallow settings patch. A temporary project with an isolated, trusted Codex home passed existing tooling bootstrap, fresh skill discovery and content verification. It preserved Portuguese project settings and custom Continuity fields, restored unfinished work into a new chat through the installed runtime, and replayed the same checkpoint without writing duplicate progress. A second bootstrap verification after executing the runtime confirmed the active installed bytes still match the pin. Neither packaged command execution nor skill discovery proves automatic host event capture.

The upstream PR is merged and [v0.13.0 is published](https://github.com/Monolith-INC/agent-continuity/releases/tag/v0.13.0). The framework pin was verified against a clean archive of that published tag, with no checksum change from the verified candidate.

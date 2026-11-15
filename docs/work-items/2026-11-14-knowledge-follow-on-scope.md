# Knowledge and Continuity — Follow-on Plan Boundaries

Status: Scope map, not executable implementation instructions. Companion to the [foundation implementation plan](2026-11-14-knowledge-foundation-implementation-plan.md) and [working design](unified-plugin-framework-draft-plan.md).

The design contains several independently testable subsystems. Implementing them through one large plan would hide unresolved product decisions. The foundation plan is ready for review; write the following separate implementation plans after settling their listed decisions.

## Plan B: Knowledge incorporation and freshness

Deliver a tool that accepts session/project evidence, proposes authoritative documentation changes, and produces optimized knowledge records linked to those sources. `Knowledge/Session_Decisions.md` indexes decisions; it never duplicates their full text. Preserve observation, user decision, proposal, and uncertainty as distinct record kinds.

Keep conversion planning pure: input snapshots and candidate statements in, proposed document and knowledge changes out. Put reading, writing, and model invocation behind explicit boundaries. Do not add a second store engine.

Freshness must compare source content, including uncommitted changes and missing sources, rather than relying only on commit history or recent timestamps. Changed evidence marks dependent knowledge as needing review. Reverting or amending a commit must re-evaluate what remains true without erasing historical decisions. Concurrent changes must be rejected or reconciled, never overwritten silently.

Decisions needed: which changes may publish automatically; which require user review; precise retained evidence and source-reference format. Proposed interim behavior is to save candidates and defer publication until reviewed, but this is not an agreed permanent policy.

Acceptance evidence: source changes with unchanged timestamps are detected; unrelated units remain untouched; a human-authored rule is not rewritten as an inferred rule; a failed partial publish can resume without duplicate documents; one decision remains traceable through source, session, and optimized representation.

## Plan C: Session ledger and checkpoint capture

Deliver the session lifecycle independently of archive and host-specific automation. Normalize seven checkpoint kinds: first code change per file per session, commit added, commit rolled back/amended, task started/ended, successful push, review finished, and before session end. Distinguish successful operations from failed attempts; give retries a stable event identity.

Agreed rules: eight hours elapsed wall-clock time, including idle time; automatically close at the limit and create a linked continuation carrying unfinished work; ask before replacing a session when checkout or intention changes; recover unreadable records from the last readable record with a brief diagnostic; checkpoint retries cannot duplicate or lose progress.

A stopped host cannot execute a timer. The implementation must distinguish the recorded eight-hour expiry from the time continuation is physically created after wake-up. It must not invent activity during downtime. Reopening after several idle days should not manufacture dozens of empty sessions.

Keep transition planning pure with injected time and record snapshots. Separate checkout identity from branch name so multiple checkouts do not become one session accidentally. Detect user intention from explicit conversation evidence, not an unexplained similarity score.

Decisions needed: reliable host event sources and capability limitations; first-record recovery when no readable records exist; whether concurrent chats share a ledger session or each have linked sessions. Existing archived-session registry code mentioned in the reference plan was not present in the inspected published Continuity `main`; locate the intended revision before deciding what to reuse.

Acceptance evidence: boundary at exactly eight hours; resume after idle time; first-edit deduplication; same event replay after crash; checkout change prompts once; malformed/missing records do not block work; last readable state restores unfinished work without inventing approvals.

## Plan D: Verified session archival

Deliver read, restore, and archive operations with a default of 10 recent sessions readily readable. Archive only after verifying preservation of decisions, evidence, and unfinished work, and proving archived content can be recovered. Retain links to authoritative decision documents.

Proposed mechanics from the user's archive reference: monthly reproducible compressed files, a portable manifest, lookup across plain and archived records, on-demand archive, and a suggestion at more than 20 plain records. Ongoing and unreadable records are excluded from archive selection. These mechanics remain proposals beyond the agreed count and preservation requirements.

Decisions needed: archive timing; format; whether archives must be tracked by Git; handling of human-readable links to archived sessions; treatment of restored records on the next archive run. Do not require Git merely to recover a session unless that requirement is explicitly selected.

Acceptance evidence: newest 10 retained; corruption prevents original removal; interruption between archive, manifest, and original removal is recoverable; repeated runs do not duplicate records; traversal/symlink entries cannot escape archive roots; one record can be shown without restoring the entire archive; checksum failure preserves source and reports a bounded diagnostic.

## Plan E: Consumer and host integration

Connect Continuity, review, Discovery, and tracking to the same configured store. Preserve dependency source files and define explicit supported interfaces rather than importing private files or relying on guessed tool names. Keep first-host qualification separate from cross-host claims.

Prove each checkpoint source in the actual host. A Git command appearing in chat is not proof that a commit or push succeeded. Unsupported hooks need an explicit alternative, not a claim of automatic coverage. Verify the independent review skill uses shared knowledge without starting a second server/store unintentionally.

Discovery modes and the boundary between Superpowers and BMad remain product design work. Tracking publication rules must be reconciled with the agreed user experience. These are separate plans, not inferred from the knowledge extraction.

## Coverage summary

| Agreed requirement | Owning plan |
| --- | --- |
| Independent knowledge plugin and reused storage | Foundation |
| One project store and setup defaults | Foundation; integration in E |
| Human documents, durable artifacts, optimized knowledge | B |
| Decision index without duplicated contents | B |
| Source-driven freshness | B |
| Seven checkpoint events | C; host event capture in E |
| Eight elapsed hours and linked continuation | C |
| Checkout/intention changes and readable-record recovery | C |
| Safe checkpoint retries | C |
| Keep 10 recent sessions and verified preservation | D |
| Standalone tools and full project companion | Foundation plus B–E |

No product code, installed plugins, upstream repositories, or session records were changed while writing these plans.

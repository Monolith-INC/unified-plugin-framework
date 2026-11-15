# Core functionalities — Tracker coverage review

Date: 2026-11-15  
Status: Findings and considerations for later planning. No tracker changes or implementation authorization are implied.

## Conclusion

The concrete core functionality plan is not represented by implementation issues
in the reviewed project backlog. The backlog primarily covers the earlier
Unified Plugin Contract infrastructure: dependency resolution, capability
matching, graph installation, wrappers, coordinated updates, and host conformance.

These are related layers, but delivering the infrastructure issues does not by
itself deliver the project companion described in the core functionality plan.

## Scope and evidence

Reviewed the existing Linear project **Unified Plugin Framework**, identifier
**P-AGE-6**, UUID `93a112cc-ef52-49f7-9e04-3642a5f78a17`:

- [Project overview](https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview)
- All 28 project issues, including their full descriptions and acceptance criteria.
  The project-scoped listing included archived items and returned no further page.
- Project description, milestones, and linked resource metadata.
- Local [core functionality scope](unified-plugin-framework-core-functionalities.md),
  extracted from the [working draft](unified-plugin-framework-draft-plan.md).

Issue status snapshot: 3 Done, 23 Todo, 1 In Progress, and 1 Backlog. All reviewed
issues had no parent issue assigned. These observations are a point-in-time
snapshot; later tracker changes require a fresh comparison.

This review assessed explicit issue scope and acceptance criteria. It did not
retest implementation, infer delivery from local code, or establish that work is
absent from other projects. Other projects were outside the requested scope.
Linked project documents were not independently reread during this comparison;
their presence is not treated as implementation-issue coverage.

## Existing backlog focus

| Stage | Issues | Scope |
| --- | --- | --- |
| Fork foundation | AGE-61, AGE-62, AGE-63, AGE-86 | Ownership/licensing, linked fork and baseline, delivery workflow, reviewed upstream sync and inherited checks |
| M0: schema and architecture | AGE-64–65 | Manifest compatibility and independent contract decisions |
| M1: composition contract | AGE-66–67 | Extension schema, fixtures, pure parser and diagnostics |
| M2: dependency resolution | AGE-68–70 | Version resolution, conflicts/cycles, source identity and lock proposals |
| M3: read-only composition planning | AGE-71–73 | Capability matching, overlay/host planning and compose commands |
| M4: graph installation | AGE-74–76 | Artifact lookup, coordinated installation/recovery and shared ownership |
| M5: broker and wrappers | AGE-77–79 | Authorized exported-capability invocation, wrappers and A/B/C demonstration |
| M6: plugin updates | AGE-80–82 | Update planning, compatible activation, rollback and shared-consumer constraints |
| M7: qualification and release | AGE-83–85 | Host conformance, composition acceptance/security/recovery tests and release evidence |
| Repository maintenance | AGE-87–88 | Workflow-hook parsing limitations and cleanup of untracked files |

At review time AGE-61, AGE-62, and AGE-63 were Done; AGE-88 was In Progress;
AGE-87 was Backlog; the remaining issues were Todo.

The project's linked architecture and implementation-plan resources also target
the original contract workstream. The listed milestones run from F0 through M7;
none explicitly names the knowledge, session, or integrated product workflows.

## Core functionality coverage

| Requirement | Finding | Missing explicit delivery scope |
| --- | --- | --- |
| Discovery and planning | No implementation issue found | Integrate Superpowers/BMad methods, define entry modes, and support starting from ideas, proposals, or existing plans |
| Project tracking | No product integration issue found | Connect Agile Backlog Toolkit preparation, validation, decomposition, publication, and delivery workflows |
| Knowledge-grounded code review | No product integration issue found | Connect review to requirements, house rules, and the shared project knowledge store |
| Independent knowledge plugin | Planning-file reference only | Extract/package the existing knowledge skill and server, preserving inherited source and contracts |
| One project knowledge store | No implementation issue found | Shared configuration and retrieval/write behavior across consumers without a second store |
| Knowledge incorporation and freshness | No implementation issue found | Prepare durable documents and optimized records; preserve source links and statement kinds; detect changed evidence |
| Setup defaults | No implementation issue found | Recommended choices, reuse of existing settings, document arrangement, and explicit storage locations |
| Seven checkpoint event kinds | No implementation issue found | First edit per file/session, commit, rollback/amendment, task start/end, push, review completion, and session end |
| Session lifecycle | No implementation issue found | Eight elapsed hours including idle time, linked continuation, checkout/intention handling, and unfinished-work preservation |
| Session recovery | No implementation issue found | Continue from readable evidence after malformed, missing, or unreadable records without inventing approvals or progress |
| Retention and verified archival | Reference-file mention only | Keep ten recent sessions readily readable; verify preservation and recovery before archival |
| Standalone tools | No implementation issue found | Independently invokable tools from the integrated sources, alongside guided workflows |

## References that should not be mistaken for coverage

### Planning-file cleanup is not knowledge implementation

[AGE-88 — Clean up untracked files on main](https://linear.app/agentical-monolithics/issue/AGE-88/clean-up-untracked-files-on-main)
mentions the knowledge planning documents and session archive reference. Its
acceptance concerns deciding whether files should be committed, ignored, or moved,
and leaving no unexplained untracked files. It does not deliver their functionality.

### Repository workflow enforcement is not the product's workflow integration

[AGE-63 — Protect main and establish the delivery workflow](https://linear.app/agentical-monolithics/issue/AGE-63/f0-protect-main-and-establish-the-delivery-workflow)
covers this repository's ticket, branch, review, merge, and completion discipline.
It does not integrate the product's tracking or knowledge-grounded review tools.

[AGE-87 — Workflow hooks: command-text limits to consider](https://linear.app/agentical-monolithics/issue/AGE-87/workflow-hooks-command-text-limits-to-consider)
concerns parsing limitations in those enforcement hooks. It does not implement
the seven continuity checkpoints or session lifecycle.

### Similar technical terms describe different requirements

- AGE-75's recovery journal concerns plugin installation, not session recovery.
- AGE-76's approval freshness concerns installation plans, not knowledge freshness.
- AGE-80–82 concern plugin-version updates and shared dependencies, not updating
  source-backed knowledge or coordinating knowledge-store writers.
- AGE-83's host conformance concerns the composition contract; it does not
  establish that the concrete continuity events are captured in each host.

Those issues may provide reusable infrastructure, but their existing acceptance
criteria do not establish the missing product behavior.

## Project metadata drift

The project description still says no fork, installations, or releases have been
executed and presents the fork destination as undecided. The fork ownership and
creation issues AGE-61 and AGE-62 are already Done. At least the fork-related
status text therefore needs reconciliation with the recorded work.

The project summary and milestones describe the composition infrastructure and
do not yet explain the concrete companion functionality. This creates a risk
that readers assume the existing backlog represents the entire intended product.

## Considerations for the next planning pass

These are recommendations, not approved tracker edits or a final task breakdown.

1. **Represent the product scope in the existing project.** Add a core-functionality
   workstream within P-AGE-6; do not create a replacement project or move work to
   the upstream Agent Plugins Toolkit project.
2. **Use the existing local planning boundaries.** The
   [knowledge foundation plan](2026-11-14-knowledge-foundation-implementation-plan.md)
   covers the initial independent knowledge subsystem. The
   [follow-on scope](2026-11-14-knowledge-follow-on-scope.md) separates Plan B
   (incorporation/freshness), C (session ledger/checkpoints), D (verified archival),
   and E (consumer/host integration).
3. **Give integrated workflows explicit scope.** Discovery, tracking, review,
   and standalone tools need named delivery issues and acceptance criteria;
   a generic capability broker demonstration does not establish those integrations.
4. **Map requirements to accountable issues.** Each core requirement should have
   an owning issue and observable acceptance evidence. Where useful, group related
   issues under a feature or milestone instead of leaving ownership implicit.
5. **Reassess infrastructure dependencies.** Preserve useful existing issues, but
   justify their priority and prerequisite relationships against concrete product
   needs. Do not assume the complete resolver/broker/update roadmap must precede
   every independently useful subsystem.
6. **Reconcile existing code before scheduling duplicate implementation.** A local
   knowledge implementation branch was identified earlier in this chat; its current
   implementation and qualification state were not re-audited in this tracker
   comparison. Check that work before creating execution tasks, while still recording
   its scope and remaining gaps in the tracker.
7. **Keep unresolved decisions explicit.** Publication approval policy, Discovery
   modes, default paths, intent/checkout detection, retained evidence, and archive
   mechanics must not silently become settled acceptance requirements.
8. **Qualify actual consumer and host behavior.** Require evidence of one shared
   store, safe concurrent writes, source-driven freshness, retryable checkpoints,
   linked continuation, and recoverable archives. Avoid equating registration,
   static skill walkthroughs, or generic host support with end-to-end functionality.
9. **Update project narrative alongside the backlog.** Reconcile the fork status
   and distinguish supporting architecture from product delivery so progress is
   understandable to a reader unfamiliar with this chat.

## Outcome and limits

No issues, milestones, project descriptions, or linked tracker documents were
created or changed during this review. The absence of explicit issue coverage
means the product scope needs tracker reconciliation; it does not mean every
capability must be implemented from scratch or that existing local work is absent.

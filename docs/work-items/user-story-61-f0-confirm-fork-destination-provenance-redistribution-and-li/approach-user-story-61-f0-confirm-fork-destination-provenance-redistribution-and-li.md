---
title: 'Record fork ownership and publication policy'
type: approach
ticket: AGE-61
created: '2026-11-14'
status: implemented-pending-closure
route: full
route_source: pinned
review: thorough
review_source: pinned
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** The public fork already exists, but the first foundation ticket still lacks a confirmed ownership and publication record. The inherited baseline has no root license file, and the inspected records do not establish redistribution permission.

**Approach:** Reuse the existing fork. Record observed facts separately from human decisions in one ownership document, then link that record from the README. Preserve the actual chronology and leave the foundation gate open until permission and publication choices are resolved.

**Confirmed destination:** The user selected the existing public `Monolith-INC/unified-plugin-framework` on 2026-11-14. This confirms the owner, name and visibility to record, without establishing copyright authority or publication permission.

**Ownership statement:** On 2026-11-14, the user selected “I own the inherited source.” Cite this conversation as the source of that statement. Ownership was asserted by the user, not independently verified; no license or package publication policy was selected by that answer.

**License selection:** The user subsequently delegated selection of a usual plugin license. Selected Apache License 2.0 (`Apache-2.0`), also used by OpenAI's community-plugins repository and Anthropic's claude-plugins-official repository, checked on 2026-11-14. Record the standard license for the user-owned project while preserving any third-party notices and separate terms. This draft records the selection; it does not claim a license file has already been applied. Package publication is outside this work.

Sources: https://github.com/openai/community-plugins ; https://github.com/anthropics/claude-plugins-official/blob/main/LICENSE ; authoritative license text: https://www.apache.org/licenses/LICENSE-2.0.txt .

## Boundaries and constraints

Use the Unified Plugin Framework Linear project and harness tools for tracker workflows. Preserve inherited package identities and source files. Apply the selected license to user-owned material and retain third-party terms. This slice does not create a fork, change visibility, publish packages, or implement composition behavior. Record the user's ownership assertion as its source rather than claiming independent verification.

## Decision and edge cases

| Situation | Expected behavior |
| --- | --- |
| Existing linked public fork | Record its current owner, parent and visibility; the user confirmed this destination. |
| License or permission not established | Record the missing evidence and unresolved policy; do not mark the foundation gate passed. |
| Valid ownership and permission evidence supplied | Record its source, scope and date without expanding the grant. |
| Proposed package publication | Require a separate explicit policy covering names, destination and authority. |
| Missing pre-fork approval record | Preserve this historical gap instead of claiming approval preceded creation. |

</frozen-after-approval>

## Code map

- `README.md`: existing fork baseline and unresolved publication statement; add a link to the approved ownership record during execution.
- `docs/upstream/ownership.md`: proposed authoritative ownership, permission and publication record.
- `package.json`, `packages/*/package.json`: evidence of inherited identities and publication configuration; inspect only for this slice.
- `discovery.md` beside this approach: verified repository metadata, source links and observed contradictions.
- Linear plan v0.2: foundation exit conditions and boundary with AGE-62 (fork/baseline) and AGE-63 (protection/checks).

## Provisional tasks and acceptance

- [x] `docs/upstream/ownership.md`: create one ownership record with a compact decision table (observation or decision, evidence or human answer, date, unresolved limits). Include the confirmed destination, permission scope, publication policy versus enforced controls, actual chronology, dated repository evidence, and links to remaining foundation and release decisions. Identify the older pre-fork planning statement as historical.
- [x] `README.md`: link to that record and align its foundation status with the approved facts.
- [x] `LICENSE`: add the unmodified standard Apache License 2.0 text; document the selected project license in README and preserve existing third-party notices and terms. Do not change inherited package manifests in this slice.
- [x] `docs/upstream/ownership.md`: verify current owner, visibility and source before closure; check every acceptance condition and list unresolved conditions explicitly.
- [ ] Harness-managed AGE-61 record: during refinement, explicitly resolve how to handle its original pre-fork decision requirement now that the fork exists. Preserve the original requirement and chronology; do not declare the historical condition satisfied without evidence. Attach final verification through the supported workflow.

Acceptance:

- Given the existing fork, when its destination is confirmed, then the record names its owner, visibility, parent and observation date.
- Given permission evidence or an explicitly unresolved permission question, when the record is reviewed, then the evidence and its limitations are distinguished from human decisions, and unresolved permission prevents foundation completion.
- Given inherited package names, when publication policy is recorded, then no package publication or namespace change is implied by this documentation task.
- Given the original pre-fork requirement and an already-created fork, when chronology is documented, then no missing historical approval is invented.

## Open questions

No unanswered choice remains for this slice: the existing destination and user ownership statement are captured, Apache-2.0 was selected under the user's delegated choice, and no package release is requested. The historical pre-fork acceptance mismatch must still be reconciled explicitly during ticket refinement.

## Verification

Compare the final ownership record with current GitHub metadata, the pinned baseline tree and the supplied permission evidence. Record observation dates and check every acceptance condition before closure. The ownership document alone grants no package publication or later milestone approval; AGE-62 and AGE-63 retain their separate foundation responsibilities. Check README links and changed-file scope. No application behavior changes are planned, so implementation tests would not establish ownership or publication permission. If execution expands into package configuration or source changes, reassess scope and run the repository's required checks.

## Implementation notes

Approved for execution by the owner on 2026-11-15 ("go with A") and implemented that day on branch `feature/AGE-61-ownership-and-license`. The owner stated that Monolith-INC holds the copyright and accepted publishing the license now. The last task, how AGE-61 treats the original pre-fork requirement, stays open for the owner at closure. Delivered: `LICENSE` (unmodified Apache-2.0), `NOTICE`, `docs/upstream/ownership.md` and the README licensing paragraph. The statements above that no license is applied describe the state before execution. The discovery and review files in this folder are historical planning records; `docs/upstream/ownership.md` is the current record.

## Plan change log

- Accepted Assumption Audit: preserve the existing fork's actual chronology, distinguish administrator access from copyright authority, and treat missing permission evidence as unresolved. Do not infer workspace-wide publication controls from the private root package. Keep these distinctions in the eventual ownership record.
- Accepted Source Triangulation: cite dated GitHub, local history and documentation evidence; identify the outdated pre-fork planning statement without altering historical records. Repeated technical observations do not establish permission to publish.
- Accepted Pre-mortem Analysis: add a final dated evidence and acceptance check before closure. Keep unresolved permission explicit, and distinguish this ticket from AGE-62, AGE-63 and the full foundation milestone.
- Accepted Second-Order Thinking: state the scope of permission, distinguish policy from technical enforcement, and link separate package-release and foundation decisions without duplicating their requirements.
- Accepted Critique and Refine: consolidate document tasks, use a compact evidence/decision table, preserve the pre-fork acceptance mismatch for explicit refinement, and keep draft status until consequential choices and approval are captured.
- The user confirmed the existing public Monolith-INC repository as the destination; remove that resolved question without treating it as a permission grant.
- The user stated they own the inherited source. Record this statement and its conversation source; keep the distinct licensing and publication decision open.
- The user delegated license selection. Selected Apache-2.0 using current first-party plugin repository examples; add the standard license file during approved execution and preserve third-party terms. Package publication remains outside this work.

## Review triage log

Standard planning depth, all five method outcomes, the existing repository destination and the user's ownership statement were captured through the harness. Apache-2.0 was selected under the user's delegated choice; no package publication is requested. No implementation approval has been recorded.
- 2026-11-15: execution approved by the owner and implemented; see Implementation notes. Closure waits on the pre-fork requirement task.

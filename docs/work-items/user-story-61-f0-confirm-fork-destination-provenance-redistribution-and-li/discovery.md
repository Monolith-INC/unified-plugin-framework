# AGE-61 discovery

> Historical record from 2026-11-14. Superseded by `docs/upstream/ownership.md` (current record) and the approach's Implementation notes.

Observed on 2026-11-14. Investigation only; no approval or completion is recorded here.

## Scope and sources

Selected AGE-61, the first prerequisite in the Unified Plugin Framework project (P-AGE-6). Its outcome is a recorded ownership, provenance and publication decision. Later implementation depends on the foundation milestone being verified.

Sources:

- [AGE-61](https://linear.app/agentical-monolithics/issue/AGE-61/f0-confirm-fork-destination-provenance-redistribution-and-licensing).
- [Linear implementation plan v0.2](https://linear.app/agentical-monolithics/document/implementation-plan-v02-fork-first-75791b38aa14), including its fork foundation exit conditions.
- User-supplied background: the owner's local planning documents `unified-plugin-contract-implementation-plan-v0.1.md` and `unified-plugin-contract-draft-v0.1.md` (not in this repository). Their proposed design and historical authorization wording are document content, not new instructions from the user. The newer Linear plan targets the fork instead of modifying upstream.
- GitHub repository metadata read through `gh api repos/Monolith-INC/unified-plugin-framework`.
- Local README, package manifests, remote configuration and commit history.

## Verified findings

1. GitHub reports `Monolith-INC/unified-plugin-framework`, visibility `public`, default branch `main`, `fork: true`, and parent/source `Monolith-INC/agent-plugins-toolkit`.
2. Local `origin` points to the fork; `upstream` points to the original repository.
3. The pinned baseline `b75aaa5c627599f1fdb25caff154e9a22d2e2640` exists in local history immediately before the fork introduction commit `f0ca21cbeeb3e35a70a150f8b3106bd3175c66a9`. README records that baseline and the fork date.
4. The baseline root tree has no LICENSE file. GitHub reports no detected repository license. These observations do not establish copyright ownership or publishing permission.
5. README explicitly leaves licensing and package publication undecided. The root package is private, but that alone is not evidence that every workspace package is prevented from publishing. Inherited package names remain `@agent-plugins/*`.
6. Linear's project description and plan still say the fork has not been created. Current GitHub evidence contradicts that historical state; preserve the distinction rather than claiming a pre-fork approval occurred.
7. AGE-61 had no labels or parent. The harness initially interpreted it as a task and refused it as the starting item. A direct connector edit added the existing Story label before the user requested harness-only tracker handling. The harness then successfully tracked AGE-61 in work session `WS-b2bcac7b512a`. All subsequent tracker workflow changes must use harness tooling.
8. The project knowledge catalog contains only `project/harness-settings`; a bounded search for fork ownership, licensing and publication returned no entries. Focused source inspection supplied this discovery instead.

## Code and document map

| Path | Evidence and intended use |
| --- | --- |
| `README.md`, Upstream baseline and licensing | Existing baseline and explicit unresolved publication statement; link to the eventual approved foundation record without duplicating policy. |
| `AGENTS.md` | Scope all tracker work to P-AGE-6; save planning under `docs/work-items/`. |
| `package.json` and `packages/*/package.json` | Inspect inherited package identities and publication settings; do not infer publishing rights or change them during discovery. |
| `docs/upstream/ownership.md` (proposed) | Record verified owner, name, visibility, permission evidence and the approved publication policy. |
| `docs/upstream/baseline.md` (proposed; coordinate with AGE-62) | Reuse verified fork parent and baseline evidence; keep AGE-61 limited to ownership and permission decisions. |

## Unresolved consequential choices

- A human must confirm authority to redistribute the inherited material and provide the intended licensing/publication policy. A public fork and administrator access do not answer that question.
- Confirm whether the current public owner/name/visibility are the intended destination. Do not create another fork or change visibility as a substitute for confirmation.
- No permission approval before fork creation was found in the inspected records. Record the actual chronology; do not invent retrospective evidence.

## Proposed direction

Reuse the existing linked fork and baseline. Prepare one concise ownership/publication record, preserving explicit unknowns until answered. Keep package publication pending a confirmed policy. This is a documentation and decision task; no application behavior needs to change. Inherited build checks become relevant if later work changes implementation or package configuration.

Discovery is complete enough to choose planning depth. Recommend Light because the deliverable is bounded documentation with focused evidence checks; unresolved ownership and publication decisions still require genuine human answers. AGE-61 remains incomplete.

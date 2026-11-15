# Fork ownership, provenance and licensing

This record states who owns this fork, where its source comes from, and under which license it is distributed. Observed facts and human decisions are kept apart, with their source and date.

## Record

| Item | Kind | Value | Source | Date |
| --- | --- | --- | --- | --- |
| Destination | Observed | `Monolith-INC/unified-plugin-framework`, public, a GitHub fork of `Monolith-INC/agent-plugins-toolkit`, created 2026-11-14 11:47 UTC | GitHub repository metadata | 2026-11-15 |
| Destination | Decision | Keep the existing public fork as the project's home | Owner, in conversation | 2026-11-14 |
| Upstream baseline | Observed | Forked at commit `b75aaa5c627599f1fdb25caff154e9a22d2e2640`; original history preserved | Local git history, `docs/upstream/baseline.md` | 2026-11-14 |
| Inherited license | Observed | The baseline has no license file; GitHub detected no license; no package manifest declares one | Baseline tree, GitHub metadata, `package.json` files | 2026-11-15 |
| Ownership of inherited source | Owner's statement (unverified) | The owner stated they own the inherited source. This is the owner's assertion and has not been independently verified. | Owner, in conversation | 2026-11-14 |
| Copyright holder (Licensor) | Owner's statement (unverified) | Monolith-INC holds the copyright to the inherited source and to this fork | Owner, in conversation | 2026-11-15 |
| Project license | Decision | Apache License 2.0 (`Apache-2.0`), selected under the owner's delegated choice | Owner delegation; [license text](https://www.apache.org/licenses/LICENSE-2.0.txt) | 2026-11-14 |
| Reason for the choice | Observed | Plugin repositories use Apache-2.0, for example [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/blob/main/LICENSE) and [openai/community-plugins](https://github.com/openai/community-plugins/blob/main/LICENSE) | Checked on GitHub | 2026-11-14 |
| Applying the license now | Decision | Publish Apache-2.0 now, with ownership resting on the owner's own statement. The owner accepted that the grant cannot be withdrawn. | Owner, in conversation | 2026-11-15 |
| License files | Applied | `LICENSE` holds the unmodified Apache-2.0 text; `NOTICE` names Monolith-INC as copyright holder and credits the upstream toolkit | This repository | 2026-11-15 |
| Package publication | Not decided | No package is published. Inherited package names (`@agent-plugins/*`) are unchanged. Publishing needs its own decision on names, registry and authority. | This record | 2026-11-15 |

## Chronology

The original plan required this decision before the fork was created. The fork was created on 2026-11-14, before the decision was recorded. No earlier approval was found, so none is claimed; the decision above is recorded after the fact.

## Open items

This record does not pass the fork-foundation gate. Still open:

- Package publication: names, registry and authority are undecided. Package manifests declare no `license` field yet; add it when publication is decided.
- The upstream sync procedure and the inherited test baseline (AGE-86). The fork baseline is recorded in `docs/upstream/baseline.md` (AGE-62).
- The original pre-fork approval requirement: on 2026-11-15 the owner accepted it as met after the fact, as recorded in the chronology above.

## Scope

- Third-party material keeps its own terms. Code added later from other sources, such as vendored dependencies, keeps its original license and notices.
- This record does not authorize package publication or approve later milestones.
- Fork protection and the delivery workflow are covered separately (see `docs/work-items/2026-11-15-ticket-first-hook-design.md`).

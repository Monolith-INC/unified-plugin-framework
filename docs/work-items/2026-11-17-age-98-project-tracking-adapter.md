# AGE-98: Project tracking workflow adapter

Date: 2026-11-17

Ticket: [AGE-98](https://linear.app/agentical-monolithics/issue/AGE-98/project-tracking-workflow-adapter-agile-backlog-toolkit)

Status: Implementation approved in chat. AGE-100 is merged. Work uses one branch from current main: `feature/AGE-98-project-tracking-adapter`.

## Outcome

Turn an approved Discovery design into the work items its scope calls for, enriched to the project's team format, validated, and broken down into implementable stories and tasks. Start from existing work when present. Keep source requirements, decisions and acceptance criteria traceable throughout.

The project owns tracker selection, language and document locations. All work-item reads and writes go through AGE-100's `project-operations` boundary. Missing settings lead to bootstrap and resumption there; tracking does not introduce another setup routine.

## Contract v1

The workflow name is `project-tracking`. Framework operations name neither a plugin nor a tracker.

| Operation | User outcome | Current toolkit contribution |
| --- | --- | --- |
| `track-from-design` | Size the approved design, generate the initial item, and guide it through enrichment, validation and breakdown | `generate-work-item`, with the operations below |
| `track-enrich` | Fill missing context and bring an existing item into the team's template | `enrich-work-item` |
| `track-validate` | Validate an item, correct supported issues, and report any unresolved rule with a recovery | `validate-artifact`, `auto-fix-artifact` |
| `track-decompose` | Turn a larger item's requirements into correctly parented child items | `decompose-backlog` |
| `track-split` | Split a story that exceeds the agreed implementable scope | `split-story` |
| `track-breakdown` | Preserve the story's acceptance criteria and derive its implementation plan and atomic tasks | `generate-breakdown-work-items` |
| `track-amend` | Apply agreed corrections across the affected work-item tree | `amend-workitems` |

Each operation remains independently usable. The full path is generate → enrich → validate → decompose or split as needed → break down → publish through the selected project adapter. Resume the affected step when the user supplies missing information; do not start the whole process again.

## Reuse boundary

The current published Agile Backlog Toolkit release is `v0.12.1`, commit `e7ae82c31771a0ccda22c21858eee066168de1f2`. Its public skills and reference library supply writing, sizing, decomposition and validation guidance. Its native conductors still include tracker-specific reads/writes, destination questions and fixed output contracts.

The tracking adapter must therefore provide a scoped content view of those published instructions rather than directly invoking the native conductors. Reuse the applicable content/rule sections; supply ingestion and publication through the project's existing operations. Do not execute native tracker stages, ask for a new destination, or load native provider instructions into the framework's shared workflow instructions. The project's team template and language take precedence over the toolkit's fixed headings and defaults.

Keep the original dependency files unchanged. Use the clean published release for pinning rather than the local checkout's unrelated modifications. The adapter's content selections must be explicit for that version; detect missing or changed sections instead of silently producing an incomplete view. Include every consumed public reference in upgrade evidence so changes outside skill folders cannot bypass the pin. Preserve attribution for any generated excerpt.

This boundary must not become a second backlog engine. Reuse applicable toolkit rules and its deterministic checks where their published contract fits; report incompatible checks as such instead of claiming that a different team template passed them. Project-specific acceptance-criteria coverage, parent relationships and publication results are verified through the project contract.

## Work sequence

1. Register the typed contract and frozen tracking adapter; add a framework template for each operation using the existing assembler. Add only the rendering/content-selection support these operations actually need.
2. Bind the pinned toolkit's content contribution without importing its tracker behavior. Add focused checks for provider-free instructions, project-template precedence and source/reference drift.
3. Connect the tracking path to project operations and the shared knowledge store. Reuse known facts before asking; preserve completed content and existing item identity. Keep unknown decisions explicit. Prepare a reviewable change before publishing; retry uncertain writes only after resolving their outcome.
4. Declare and pin the dependency with the existing upgrade command, rebuild host payloads, update their documented digests, and describe the workflow in `docs/workflows/` and the user journey.
5. Demonstrate an approved design becoming a correctly parented local item/task tree through the installed workflow, including resuming existing work without duplicate items.

The supplied product-flow concepts guide continuity between artifacts and gap-only questions. A small deliverable may start from an existing approved design; a Vision Doc, PRD, UI specification and ADR are not mandatory for every item. Missing UI material does not block unrelated backend work.

## Verification

During implementation, check only the touched package or decisive scenario. Cover contract completeness, the full path and direct entry points, provider leakage, team-template/language use, missing-plugin recovery, validation recovery, and resume without duplication. Add regression checks only for material failures found during that work.

Before publication, run one thermos pass and the full repository checks in a clean clone with umask 022, including payload and hook checks. The open PR receives one requirements review; post comments after the user's confirmation. Approval and merge decisions happen in chat, with the agent recording the accepted commit. Finish and remove this branch before starting another ticket.

## Verification evidence

The single correctness/maintainability review found one source-pinning issue: expanding the reviewed public-file set under an unchanged release was mistaken for upstream mutation. Pins now retain the underlying source checksum and known public-file digests. A focused regression accepts selection growth and rejects changed or omitted previously pinned source, including when a selection is removed.

A manual scenario explicitly loaded the shipped Codex skill files and used the documented source-checkout CLI. An approved synthetic design became one feature, two stories and three tasks through the local adapter. It preserved a custom five-section template and English prose, repaired a missing source-coverage link before publication, verified parents and artifacts by read-back, and resumed saved refs without duplication. Republishing the identical plan left storage unchanged. This does not establish automatic host skill discovery or live remote authentication.

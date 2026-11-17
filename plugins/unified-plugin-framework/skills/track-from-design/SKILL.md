---
name: track-from-design
description: Turn an approved design into enriched, validated work items, implementation plans and tasks. Part of Project tracking contract v1.
---
{{generated}}

# Track from Design

Start from the approved design or an existing approved work item. If approval is missing, prepare the design and request approval through the appropriate discovery mode before publishing derived scope. Use the smallest useful artifact set; do not require a full document ladder for a small deliverable.

{{readiness}}

{{tracking}}

## Deliver the work-item tree

{{delegate}}

Size the approved scope: several capabilities suggest an epic, one capability a feature, and one independently deliverable change a user story. Confirm material sizing assumptions with the user and use the project's hierarchy and agreed delivery ceiling. Reuse existing matching work rather than creating another root.

Draft the initial item with traceable source requirements and acceptance criteria. Run `track-enrich` and `track-validate`. For an epic or feature use `track-decompose` and apply those steps to its children. For an oversized story use `track-split`; for an implementable story use `track-breakdown`. Continue until each leaf story has a validated plan and atomic tasks. Reuse the same context and authorization across these steps.

Present the complete tree, coverage report and plans before publication through the shared protocol. Finish with the saved artifact paths, verified item refs, any remaining user decisions and the first implementable task.

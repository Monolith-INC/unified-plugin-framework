---
name: track-decompose
description: Derive correctly parented features or stories from an approved larger item with complete requirement coverage. Part of Project tracking contract v1.
---
{{generated}}

# Decompose Work

{{readiness}}

{{protocol}}

## Derive deliverable children

{{delegate}}

For an epic, group independent capabilities into features; for a feature, identify independently deliverable stories. Avoid an unnecessary hierarchy level when the project does not use it. For a story use `track-split` or `track-breakdown` instead. Match existing children to requirements before adding missing ones.

Show each proposed child with its parent, verbatim source slice, dependencies and acceptance criteria. Audit both orphan requirements and scope with no source; resolve gaps before publication. Run `track-enrich` and `track-validate` on each changed child. Recurse only while scope exceeds an implementable story; use `track-breakdown` for each fitting story. Publish parents before children, preserving existing refs and completed work.

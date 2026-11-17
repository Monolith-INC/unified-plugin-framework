---
name: track-breakdown
description: Derive a story's implementation plan and atomic tasks with acceptance-criteria coverage. Part of Project tracking contract v1.
---
{{generated}}

# Break Down a Story

{{readiness}}

{{tracking}}

## Plan implementation

{{delegate}}

Start with the validated story and relevant existing repository structure. For a larger item use `track-decompose`; for an oversized story use `track-split`. Preserve the story's acceptance criteria. Write an ordered implementation plan under artifactsPath linking every criterion to its delivery steps, dependencies and focused verification. State unresolved technical choices rather than inventing decisions.

Match existing tasks to plan steps before proposing new ones. Each task has the story as parent, one atomic change, source/criterion links, dependencies and a narrow observable completion check. Validate coverage with `track-validate`. Publish the plan and validation report as artifacts on the story, then the authorized missing tasks through project-operations. Report the verified story/task refs and the first runnable task.

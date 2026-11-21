---
name: track-breakdown
description: Use for planning requests around a story, spec or work item — write a durable implementation plan under artifactsPath and derive atomic tasks with acceptance-criteria coverage before requesting implementation approval. Part of Project tracking contract v1.
---
{{generated}}

# Break Down a Story

{{readiness}}

{{protocol}}

## Plan implementation

{{delegate}}

Start with the validated story and relevant existing repository structure. For a larger item use `track-decompose`; for an oversized story use `track-split`. Preserve the story's acceptance criteria. Write an ordered, durable implementation plan file under `artifactsPath` linking every criterion to its delivery steps, dependencies, explicit File Inventory and focused verification. State unresolved technical choices rather than inventing decisions.

Never declare the plan ready for review or ask for implementation approval while the plan exists only in chat. If writing the plan file itself requires permission, ask explicitly to write the plan file first, save it, and report its exact path and status before directing the user to implementation approval.

Match existing tasks to plan steps before proposing new ones. Each task has the story as parent, one atomic change, source/criterion links, dependencies and a narrow observable completion check. Validate coverage with `track-validate`. Publish the plan and validation report as artifacts on the story, then the authorized missing tasks through project-operations. Report the saved plan path, verified story/task refs and the first runnable task.

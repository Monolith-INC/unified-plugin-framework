---
name: review-task
description: Use when a small unit of work is complete, before committing or handing off, to review the changes against the task's requirements and the project's recorded decisions. Part of the code review workflow (contract v1).
---
{{generated}}

# Review Task

Review the changes made for one task against what the task asked for and against the project's recorded decisions. Report findings to the user; change no code.

{{readiness}}

## Run the review

{{delegate}}

Quality lenses: when the change is large or structural, suggest `--lenses maintainability` before starting. Mention `--lenses typescript` only for TypeScript changes that would not already be covered. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

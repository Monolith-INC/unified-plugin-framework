---
name: review-story
description: Use when a user story is finished, to review the whole story branch against the story's requirements, definition of done and the project's recorded decisions — before the pull request exists, or after it is opened. Part of the code review workflow (contract v1).
---
{{generated}}

# Review Story

Review a finished user story against its description, requirements and definition of done, and against the project's recorded decisions.

{{readiness}}

## Run the review

{{delegate}}

Before starting, suggest the skill that fits the story's state and let the user confirm. When the review before the pull request finishes cleanly and the user then opens one, offer the review for an open pull request.

Pass along the user's request and any flags. Quality lenses: when the story is large or structural, suggest `--lenses maintainability` before starting. Mention `--lenses typescript` only for TypeScript changes that would not already be covered. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

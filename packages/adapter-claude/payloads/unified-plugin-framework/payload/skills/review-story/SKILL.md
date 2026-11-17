---
name: review-story
description: Use when a user story is finished, to review the whole story branch against the story's requirements, definition of done and the project's recorded decisions — before the pull request exists, or after it is opened. Part of the code review workflow (contract v1).
---
<!-- Assembled at release time from the review-story template in plugins/unified-plugin-framework and the code-review adapter. Edit those, not this copy. -->

# Review Story

Review a finished user story against its description, requirements and definition of done, and against the project's recorded decisions.

## Check readiness and recover

Before reviewing, check each step in order. When a step fails, take its recovery action and continue with the review. Involve the user only where a step says so, in one short message.

1. **Available:** `monolithic-code-review-toolkit:review-story-preflight` and `monolithic-code-review-toolkit:review-story-postflight` are available in this session. If not, ask the user to install and enable `monolithic-code-review-toolkit` for this host, then continue once it is.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.
3. **Shared store:** each plugin below must record the same directory as `knowledgeRoot`. If one does not, run its setup skill, give it the project knowledge store's directory as its knowledge store, then continue.
   - `.monolithic-code-review/sources.json` sets `knowledge.root`; setup skill `monolithic-code-review-toolkit:review-setup`.

## Run the review

Hand the review to the skill that fits:

- `monolithic-code-review-toolkit:review-story-preflight` — Before the pull request exists: reviews the story branch and reports findings only.
- `monolithic-code-review-toolkit:review-story-postflight` — Once the pull request is open: reviews the remote diff and posts review comments; confirm before posting.

Before starting, suggest the skill that fits the story's state and let the user confirm. When the review before the pull request finishes cleanly and the user then opens one, offer the review for an open pull request.

Pass along the user's request and any flags. Quality lenses: when the story is large or structural, suggest `--lenses maintainability` before starting. Mention `--lenses typescript` only for TypeScript changes that would not already be covered. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

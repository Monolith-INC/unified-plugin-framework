---
name: review-story
description: Use when a user story is finished, to review the whole story branch against the story's requirements, definition of done and the project's recorded decisions — before the pull request exists, or after it is opened. Part of the code review workflow (contract v1).
---

# Review Story

Review a finished user story against its description, requirements and definition of done, and against the project's recorded decisions.

## Check readiness first

Check these steps in order. Stop at the first one that fails, tell the user which step failed and why, and do not review.

1. **Declared:** the framework's manifest declares `monolithic-code-review-toolkit` for the `code-review` adapter.
2. **Installed and enabled:** the skills `monolithic-code-review-toolkit:review-story-preflight` and `monolithic-code-review-toolkit:review-story-postflight` are available in this session. If they are not, report that the review toolkit is not installed or not enabled for this host.
3. **Bound:** `.project-knowledge.json` names a `knowledgeRoot`, and if `.monolithic-code-review/sources.json` names a `knowledge.root`, both point to the same directory. If no store is configured, offer `setup-project-knowledge`.

From a checkout, `agent-plugin adapter-check` runs the same steps; see `docs/workflows/code-review.md`.

## Choose pre-flight or post-flight

Before starting, suggest the review that fits and let the user confirm:

- **Pre-flight**, when no pull request exists yet: reviews the story branch and reports findings to the user. Nothing is pushed or posted. Use `monolithic-code-review-toolkit:review-story-preflight`.
- **Post-flight**, when a pull request is open: reviews the remote diff and posts review comments to the pull request. Confirm with the user before anything is posted. Use `monolithic-code-review-toolkit:review-story-postflight`.

When pre-flight finishes cleanly and the user then opens a pull request, offer post-flight.

## Run the review

Pass along the user's request and any flags. Quality lenses: when the story is large or structural, suggest `--lenses maintainability` before starting. Mention `--lenses typescript` only for TypeScript changes the toolkit would not already cover. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

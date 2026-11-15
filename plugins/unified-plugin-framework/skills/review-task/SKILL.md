---
name: review-task
description: Use when a small unit of work is complete, before committing or handing off, to review the changes against the task's requirements and the project's recorded decisions. Part of the code review workflow (contract v1).
---

# Review Task

Review the changes made for one task against what the task asked for and against the project's recorded decisions. Report findings to the user; change no code.

## Check readiness first

Check these steps in order. Stop at the first one that fails, tell the user which step failed and why, and do not review.

1. **Declared:** the framework's manifest declares `monolithic-code-review-toolkit` for the `code-review` adapter.
2. **Installed and enabled:** the skill `monolithic-code-review-toolkit:review-task` is available in this session. If it is not, report that the review toolkit is not installed or not enabled for this host.
3. **Bound:** `.project-knowledge.json` names a `knowledgeRoot`, and if `.monolithic-code-review/sources.json` names a `knowledge.root`, both point to the same directory. If no store is configured, offer `setup-project-knowledge`.

From a checkout, `agent-plugin adapter-check` runs the same steps; see `docs/workflows/code-review.md`.

## Run the review

Use `monolithic-code-review-toolkit:review-task`, passing along the user's request and any flags.

Quality lenses: when the change is large or structural, suggest `--lenses maintainability` before starting. Mention `--lenses typescript` only for TypeScript changes the toolkit would not already cover. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

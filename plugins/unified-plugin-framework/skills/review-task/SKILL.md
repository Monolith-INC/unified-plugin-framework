---
name: review-task
description: Use when a small unit of work is complete, before committing or handing off, to review the changes against the task's requirements and the project's recorded decisions. Part of the code review workflow (contract v1).
---
<!-- Generated from packages/workflows/templates/code-review/review-task.md and the code-review adapter by `pnpm payloads:build`. Edit those, not this file. -->

# Review Task

Review the changes made for one task against what the task asked for and against the project's recorded decisions. Report findings to the user; change no code.

## Check readiness and recover

Before reviewing, check each step in order. When a step fails, take its recovery action and continue with the review. Involve the user only where a step says so, in one short message.

1. **Available:** `monolithic-code-review-toolkit:review-task` is available in this session. If not, ask the user to install and enable `monolithic-code-review-toolkit` for this host, then continue once it is.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.
3. **Shared store:** each plugin below must record the same directory as `knowledgeRoot`. If one does not, run its setup skill, give it the project knowledge store's directory as its knowledge store, then continue.
   - `.monolithic-code-review/sources.json` sets `knowledge.root`; setup skill `monolithic-code-review-toolkit:review-setup`.

From a checkout, `agent-plugin adapter-check code-review` runs the same checks and prints each recovery action.

## Run the review

Use `monolithic-code-review-toolkit:review-task`, passing along the user's request and any flags.

Quality lenses: when the change is large or structural, suggest `--lenses maintainability` before starting. Mention `--lenses typescript` only for TypeScript changes that would not already be covered. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

---
name: review-feature
description: Use when a whole feature is complete, to review the full feature diff against the feature's goal, definition of done and the project's recorded decisions. Part of the code review workflow (contract v1).
---
<!-- Assembled at release time from the review-feature template in plugins/unified-plugin-framework and the code-review adapter. Edit those, not this copy. -->

# Review Feature

Review a complete feature against what it said it would do, its definition of done, and the project's recorded decisions. Report findings to the user; change no code.

## Check readiness and recover

Before reviewing, check each step in order. When a step fails, take its recovery action and continue with the review. Involve the user only where a step says so, in one short message.

1. **Available:** `monolithic-code-review-toolkit:review-feature` is available in this session. If not, ask the user to install and enable `monolithic-code-review-toolkit` for this host, then continue once it is. This workflow is tested with `monolithic-code-review-toolkit` 0.6.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.
3. **Shared store:** each plugin below must record the same directory as `knowledgeRoot`. If one does not, run its setup skill, give it the project knowledge store's directory as its knowledge store, then continue.
   - `.monolithic-code-review/sources.json` sets `knowledge.root`; setup skill `monolithic-code-review-toolkit:review-setup`.

## Run the review

Use `monolithic-code-review-toolkit:review-feature`, passing along the user's request and any flags.

Quality lenses: a feature review is the strictest gate, so suggest `--lenses all` before starting when the feature is large. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

---
name: review-feature
description: Use when a whole feature is complete, to review the full feature diff against the feature's goal, definition of done and the project's recorded decisions. Part of the code review workflow (contract v1).
---
{{generated}}

# Review Feature

Review a complete feature against what it said it would do, its definition of done, and the project's recorded decisions. Report findings to the user; change no code.

{{readiness}}

## Run the review

{{delegate}}

Quality lenses: a feature review is the strictest gate, so suggest `--lenses all` before starting when the feature is large. Run a lens only if the user agrees.

Ground the review in the shared project knowledge store, and cite each recorded decision a finding relies on, with its source.

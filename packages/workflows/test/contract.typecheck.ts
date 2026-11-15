// Compile-time contract checks (ADR-001, rule 3). This file is type-checked, never run.
import type { CodeReviewAdapter } from "../src/index.js";

export const missingOperation: CodeReviewAdapter = {
  workflow: "code-review",
  contractVersion: "1.0.0",
  // @ts-expect-error an adapter must fulfil every contract operation; review-feature is missing
  fulfil: {
    "review-task": [{ plugin: "p", skill: "s" }],
    "review-story": [{ plugin: "p", skill: "s" }],
  },
};

export const unknownOperation: CodeReviewAdapter = {
  workflow: "code-review",
  contractVersion: "1.0.0",
  fulfil: {
    "review-task": [{ plugin: "p", skill: "s" }],
    "review-story": [{ plugin: "p", skill: "s" }],
    "review-feature": [{ plugin: "p", skill: "s" }],
    // @ts-expect-error an adapter cannot add operations outside the contract
    "review-everything": [{ plugin: "p", skill: "s" }],
  },
};

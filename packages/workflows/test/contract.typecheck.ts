// Compile-time contract checks (ADR-001, rule 3). This file is type-checked, never run.
import type { CodeReviewAdapter, WorkflowAdapter } from "../src/index.js";

export const validAdapter: CodeReviewAdapter = {
  workflow: "code-review",
  contractVersion: "1.0.0",
  composition: "one-of",
  catalog: [],
  bareSkillPlugins: [],
  knowledgeStores: [],
  fulfil: {
    "review-task": [{ plugin: "p", skill: "s" }],
    "review-story": [{ plugin: "p", skill: "s" }],
    "review-feature": [{ plugin: "p", skill: "s" }],
  },
};

export const emptyOperation: CodeReviewAdapter = {
  workflow: "code-review",
  contractVersion: "1.0.0",
  composition: "one-of",
  catalog: [],
  bareSkillPlugins: [],
  knowledgeStores: [],
  fulfil: {
    // @ts-expect-error every operation needs at least one plugin skill
    "review-task": [],
    "review-story": [{ plugin: "p", skill: "s" }],
    "review-feature": [{ plugin: "p", skill: "s" }],
  },
};

export const unknownWorkflow: WorkflowAdapter<"x"> = {
  // @ts-expect-error an adapter's workflow must be a known workflow name
  workflow: "not-a-workflow",
  contractVersion: "1.0.0",
  composition: "one-of",
  catalog: [],
  bareSkillPlugins: [],
  knowledgeStores: [],
  fulfil: { x: [{ plugin: "p", skill: "s" }] },
};

export const missingOperation: CodeReviewAdapter = {
  workflow: "code-review",
  contractVersion: "1.0.0",
  composition: "one-of",
  catalog: [],
  bareSkillPlugins: [],
  knowledgeStores: [],
  // @ts-expect-error an adapter must fulfil every contract operation; review-feature is missing
  fulfil: {
    "review-task": [{ plugin: "p", skill: "s" }],
    "review-story": [{ plugin: "p", skill: "s" }],
  },
};

export const unknownOperation: CodeReviewAdapter = {
  workflow: "code-review",
  contractVersion: "1.0.0",
  composition: "one-of",
  catalog: [],
  bareSkillPlugins: [],
  knowledgeStores: [],
  fulfil: {
    "review-task": [{ plugin: "p", skill: "s" }],
    "review-story": [{ plugin: "p", skill: "s" }],
    "review-feature": [{ plugin: "p", skill: "s" }],
    // @ts-expect-error an adapter cannot add operations outside the contract
    "review-everything": [{ plugin: "p", skill: "s" }],
  },
};

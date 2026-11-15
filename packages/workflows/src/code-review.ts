import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";

/** The code review workflow's contract with users and agents (ADR-001). */
export const CODE_REVIEW_OPERATIONS = Object.freeze(["review-task", "review-story", "review-feature"] as const);

export type CodeReviewOperation = (typeof CODE_REVIEW_OPERATIONS)[number];

export const CODE_REVIEW_CONTRACT_VERSION = "1.0.0";

export type CodeReviewAdapter = WorkflowAdapter<CodeReviewOperation>;

const TOOLKIT = "monolithic-code-review-toolkit";

const toolkit = (skill: string): PluginSkillRef => Object.freeze({ plugin: TOOLKIT, skill });

/** Code review fulfilled by the Monolithic Code Review Toolkit. */
export const reviewToolkitAdapter: CodeReviewAdapter = Object.freeze({
  workflow: "code-review",
  contractVersion: CODE_REVIEW_CONTRACT_VERSION,
  fulfil: Object.freeze({
    "review-task": Object.freeze([toolkit("review-task")] as const),
    "review-story": Object.freeze([toolkit("review-story-preflight"), toolkit("review-story-postflight")] as const),
    "review-feature": Object.freeze([toolkit("review-feature")] as const),
  }),
  knowledgeStores: Object.freeze([
    Object.freeze({ plugin: TOOLKIT, file: ".monolithic-code-review/sources.json", key: ["knowledge", "root"] as const }),
  ]),
});

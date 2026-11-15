import type { PluginSkillRef, WorkflowAdapter } from "@agent-plugins/core";

/** The code review workflow's contract with users and agents (ADR-001). */
export type CodeReviewOperation = "review-task" | "review-story" | "review-feature";

export const CODE_REVIEW_CONTRACT_VERSION = "1.0.0";

export const CODE_REVIEW_OPERATIONS: readonly CodeReviewOperation[] = Object.freeze([
  "review-task",
  "review-story",
  "review-feature",
]);

export type CodeReviewAdapter = WorkflowAdapter<CodeReviewOperation>;

const toolkit = (skill: string): PluginSkillRef => Object.freeze({ plugin: "monolithic-code-review-toolkit", skill });

/** Code review fulfilled by the Monolithic Code Review Toolkit. */
export const reviewToolkitAdapter: CodeReviewAdapter = Object.freeze({
  workflow: "code-review",
  contractVersion: CODE_REVIEW_CONTRACT_VERSION,
  fulfil: Object.freeze({
    "review-task": Object.freeze([toolkit("review-task")]),
    "review-story": Object.freeze([toolkit("review-story-preflight"), toolkit("review-story-postflight")]),
    "review-feature": Object.freeze([toolkit("review-feature")]),
  }),
});

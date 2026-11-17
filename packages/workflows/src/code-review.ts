import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";

/** The code review workflow's contract with users and agents (ADR-001). */
export const CODE_REVIEW_OPERATIONS = Object.freeze(["review-task", "review-story", "review-feature"] as const);

export type CodeReviewOperation = (typeof CODE_REVIEW_OPERATIONS)[number];

export const CODE_REVIEW_CONTRACT_VERSION = "1.0.0";

export type CodeReviewAdapter = WorkflowAdapter<CodeReviewOperation>;

const TOOLKIT = "monolithic-code-review-toolkit";

const toolkit = (skill: string, use?: string): PluginSkillRef =>
  Object.freeze(use === undefined ? { plugin: TOOLKIT, skill } : { plugin: TOOLKIT, skill, use });

/** Code review fulfilled by the Monolithic Code Review Toolkit. */
export const reviewToolkitAdapter: CodeReviewAdapter = Object.freeze({
  workflow: "code-review",
  contractVersion: CODE_REVIEW_CONTRACT_VERSION,
  fulfil: Object.freeze({
    "review-task": Object.freeze([toolkit("review-task")] as const),
    "review-story": Object.freeze([
      toolkit("review-story-preflight", "Before the pull request exists: reviews the story branch and reports findings only."),
      toolkit("review-story-postflight", "Once the pull request is open: reviews the remote diff and posts review comments; confirm before posting."),
    ] as const),
    "review-feature": Object.freeze([toolkit("review-feature")] as const),
  }),
  knowledgeStores: Object.freeze([
    Object.freeze({ plugin: TOOLKIT, file: ".monolithic-code-review/sources.json", key: ["knowledge", "root"] as const, setup: "review-setup" }),
  ]),
});

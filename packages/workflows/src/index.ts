import type { WorkflowAdapter } from "@agent-plugins/core";

import { reviewToolkitAdapter } from "./code-review.js";

export {
  CODE_REVIEW_CONTRACT_VERSION,
  CODE_REVIEW_OPERATIONS,
  reviewToolkitAdapter,
  type CodeReviewAdapter,
  type CodeReviewOperation,
} from "./code-review.js";

/** The active adapter for each workflow. Its keys must match core's WORKFLOW_ADAPTERS (tested). */
export const WORKFLOWS: Readonly<Record<string, WorkflowAdapter<string>>> = Object.freeze({
  "code-review": reviewToolkitAdapter,
});

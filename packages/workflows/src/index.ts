import type { WorkflowName } from "@agent-plugins/core";

import type { WorkflowAdapter } from "./adapter.js";
import { reviewToolkitAdapter } from "./code-review.js";

export {
  adapterPlugins,
  checkAdapterReadiness,
  firstFailure,
  PROJECT_KNOWLEDGE_SETUP,
  type Monoid,
  type NonEmpty,
  type PluginKnowledgeStore,
  type PluginSkillRef,
  type Readiness,
  type ReadinessFacts,
  type Recovery,
  type ReadinessStep,
  type WorkflowAdapter,
} from "./adapter.js";

export { renderSkill, type Rendered } from "./render.js";

export {
  CODE_REVIEW_CONTRACT_VERSION,
  CODE_REVIEW_OPERATIONS,
  reviewToolkitAdapter,
  type CodeReviewAdapter,
  type CodeReviewOperation,
} from "./code-review.js";

/** The active adapter for each workflow; a missing or unknown workflow name does not compile. */
export const WORKFLOWS: Readonly<Record<WorkflowName, WorkflowAdapter<string>>> = Object.freeze({
  "code-review": reviewToolkitAdapter,
});

const WORKFLOW_LOOKUP: ReadonlyMap<string, WorkflowAdapter<string>> = new Map(Object.entries(WORKFLOWS));

/** The adapter for a workflow name from untrusted input, or `undefined`. */
export const findWorkflow = (name: string): WorkflowAdapter<string> | undefined => WORKFLOW_LOOKUP.get(name);

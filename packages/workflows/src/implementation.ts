import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";
import { IMPLEMENTATION_CONTENT } from "./implementation-content.js";

/** Approved scope to verified changes and an existing review handoff. */
export const IMPLEMENTATION_OPERATIONS = Object.freeze(["implement-work", "implement-verify"] as const);
export type ImplementationOperation = (typeof IMPLEMENTATION_OPERATIONS)[number];
export const IMPLEMENTATION_CONTRACT_VERSION = "1.0.0";
export type ImplementationAdapter = WorkflowAdapter<ImplementationOperation>;

const ref = (skill: string): PluginSkillRef => Object.freeze({ plugin: "superpowers", skill });

/** Reviewed guidance; project policy owns execution, permissions, tracking and review. */
export const superpowersImplementationAdapter: ImplementationAdapter = Object.freeze({
  workflow: "implementation",
  contractVersion: IMPLEMENTATION_CONTRACT_VERSION,
  composition: "content-view",
  fulfil: Object.freeze({
    "implement-work": Object.freeze([ref("executing-plans"), ref("verification-before-completion"), ref("systematic-debugging")] as const),
    "implement-verify": Object.freeze([ref("verification-before-completion")] as const),
  }),
  catalog: Object.freeze([]),
  bareSkillPlugins: Object.freeze([]),
  knowledgeStores: Object.freeze([]),
  contentViews: IMPLEMENTATION_CONTENT,
});

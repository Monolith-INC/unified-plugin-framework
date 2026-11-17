import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";

/** Restore, checkpoint and recover project sessions through one continuity adapter. */
export const CONTINUITY_OPERATIONS = Object.freeze(["continuity-continue", "continuity-checkpoint", "continuity-recover"] as const);
export type ContinuityOperation = (typeof CONTINUITY_OPERATIONS)[number];
export const CONTINUITY_CONTRACT_VERSION = "1.0.0";
export type ContinuityAdapter = WorkflowAdapter<ContinuityOperation>;

const session = (skill: string): readonly [PluginSkillRef] => Object.freeze([Object.freeze({ plugin: "agent-continuity", skill })]);

/** Project choices stay in the framework; the dependency owns the session lifecycle. */
export const agentContinuityAdapter: ContinuityAdapter = Object.freeze({
  workflow: "continuity",
  contractVersion: CONTINUITY_CONTRACT_VERSION,
  composition: "one-of",
  fulfil: Object.freeze({
    "continuity-continue": session("session-continue"),
    "continuity-checkpoint": session("session-checkpoint"),
    "continuity-recover": session("session-recover"),
  }),
  catalog: Object.freeze([]),
  bareSkillPlugins: Object.freeze([]),
  knowledgeStores: Object.freeze([]),
});

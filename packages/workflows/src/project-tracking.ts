import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";
import { TRACKING_CONTENT, TRACKING_LICENSE } from "./tracking-content.js";

/** Project-tracking contract v1: approved designs become traceable, implementable work. */
export const TRACKING_OPERATIONS = Object.freeze([
  "track-from-design", "track-enrich", "track-validate", "track-decompose",
  "track-split", "track-breakdown", "track-amend",
] as const);
export type TrackingOperation = (typeof TRACKING_OPERATIONS)[number];
export type TrackingAdapter = WorkflowAdapter<TrackingOperation>;
export const TRACKING_CONTRACT_VERSION = "1.0.0";

const ref = (skill: string): PluginSkillRef => Object.freeze({ plugin: "agile-backlog-toolkit", skill });

/** Reviewed content only; native tracker conductors are never delegated to. */
export const backlogTrackingAdapter: TrackingAdapter = Object.freeze({
  workflow: "project-tracking",
  contractVersion: TRACKING_CONTRACT_VERSION,
  composition: "content-view",
  fulfil: Object.freeze({
    "track-from-design": Object.freeze([ref("generate-work-item")] as const),
    "track-enrich": Object.freeze([ref("enrich-work-item")] as const),
    "track-validate": Object.freeze([ref("validate-artifact"), ref("auto-fix-artifact")] as const),
    "track-decompose": Object.freeze([ref("decompose-backlog")] as const),
    "track-split": Object.freeze([ref("split-story")] as const),
    "track-breakdown": Object.freeze([ref("generate-breakdown-work-items")] as const),
    "track-amend": Object.freeze([ref("amend-workitems")] as const),
  }),
  catalog: Object.freeze([]),
  bareSkillPlugins: Object.freeze([]),
  knowledgeStores: Object.freeze([]),
  contentViews: Object.freeze([...TRACKING_CONTENT, TRACKING_LICENSE]),
});

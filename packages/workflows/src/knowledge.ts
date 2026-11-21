import type { PluginSkillRef, WorkflowAdapter } from "./adapter.js";

/** Standalone project knowledge store lifecycle mapped to `monolithic-agent-knowledge-store`. */
export const KNOWLEDGE_OPERATIONS = Object.freeze([
  "knowledge-setup",
  "knowledge-discover",
  "knowledge-query",
  "knowledge-refresh",
  "knowledge-ingest",
  "knowledge-publish",
] as const);
export type KnowledgeOperation = (typeof KNOWLEDGE_OPERATIONS)[number];
export const KNOWLEDGE_CONTRACT_VERSION = "1.0.0";
export type KnowledgeAdapter = WorkflowAdapter<KnowledgeOperation>;

const maks = (skill: string): readonly [PluginSkillRef] =>
  Object.freeze([Object.freeze({ plugin: "monolithic-agent-knowledge-store", skill })]);

/** Project knowledge runs via standalone stdlib Python 3.12+ scripts (no MCP server). */
export const knowledgeStoreAdapter: KnowledgeAdapter = Object.freeze({
  workflow: "knowledge",
  contractVersion: KNOWLEDGE_CONTRACT_VERSION,
  composition: "one-of",
  fulfil: Object.freeze({
    "knowledge-setup": maks("setup-project-knowledge"),
    "knowledge-discover": maks("discover-project-knowledge"),
    "knowledge-query": maks("query-project-knowledge"),
    "knowledge-refresh": maks("refresh-project-knowledge"),
    "knowledge-ingest": maks("ingest-docs"),
    "knowledge-publish": maks("publish-docs"),
  }),
  catalog: Object.freeze([]),
  bareSkillPlugins: Object.freeze([]),
  knowledgeStores: Object.freeze([]),
});

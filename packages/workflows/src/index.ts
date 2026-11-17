import type { VendorAdapter } from "@agent-plugins/compiler";
import type { WorkflowName } from "@agent-plugins/core";

import type { WorkflowAdapter } from "./adapter.js";
import { reviewToolkitAdapter } from "./code-review.js";

export {
  adapterPlugins,
  checkAdapterReadiness,
  checkPluginBinding,
  mappingDigest,
  firstFailure,
  PROJECT_KNOWLEDGE_SETUP,
  type Monoid,
  type NonEmpty,
  type BindingFacts,
  type InstalledPlugin,
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
  EMPTY_LOCK,
  LOCK_FILE,
  lockText,
  parseLock,
  pinFor,
  withPin,
  type OnboardedLock,
  type ParsedLock,
  type PluginPin,
} from "./lock.js";

export { parseRange, parseVersion, satisfies, type Version, type VersionRange } from "./versions.js";

import { assemblePluginSource as assembleSource, assembleSkills as assembleWith, type Assembled } from "./assemble.js";

export type { Assembled } from "./assemble.js";

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

const ACTIVE_ADAPTERS: readonly WorkflowAdapter<string>[] = Object.freeze(Object.values(WORKFLOWS));

/** Renders template skills from the active adapters (or the given ones); other skills pass through. Pure. */
export const assembleSkills = (
  skills: ReadonlyMap<string, string>,
  adapters: readonly WorkflowAdapter<string>[] = ACTIVE_ADAPTERS,
): Assembled => assembleWith(skills, adapters);

/** Copies a plugin source into a fresh staging directory with its template skills assembled. Release-time only. */
export const assemblePluginSource = (sourceRoot: string, stagingRoot: string): Assembled =>
  assembleSource(sourceRoot, stagingRoot, ACTIVE_ADAPTERS);

import { releasePayloads as releaseWith, withAssembledSource as stageWith, type PayloadReport, type ReleaseLayout, type Staged } from "./release.js";

export { SHIPPED_PLUGINS, type PayloadReport, type ReleaseLayout, type Staged } from "./release.js";

/** Runs `use` on a temporary, assembled copy of the plugin at `sourceRoot`, then removes the copy. */
export const withAssembledSource = <A>(sourceRoot: string, use: (assembledRoot: string) => A): Staged<A> =>
  stageWith(sourceRoot, ACTIVE_ADAPTERS, use);

/** Builds or verifies one host's payloads for every shipped plugin, assembled with the active adapters. */
export const releasePayloads = (operation: string, adapter: VendorAdapter, layout: ReleaseLayout): readonly PayloadReport[] =>
  releaseWith(operation, adapter, layout, ACTIVE_ADAPTERS);

import type { Result, VendorAdapter, VendorBundle } from "@agent-plugins/compiler";
import type { WorkflowName } from "@agent-plugins/core";
import { agentContinuityAdapter } from "./continuity.js";
import { superpowersImplementationAdapter } from "./implementation.js";

import type { WorkflowAdapter } from "./adapter.js";
import type { OnboardedLock } from "./lock.js";
import { reviewToolkitAdapter } from "./code-review.js";
import { backlogTrackingAdapter } from "./project-tracking.js";

export { backlogTrackingAdapter, TRACKING_OPERATIONS, TRACKING_CONTRACT_VERSION, type TrackingAdapter, type TrackingOperation } from "./project-tracking.js";
export { selectContent, providerLeak, type ContentSelection } from "./content-view.js";

export {
  brainstormingDiscoveryAdapter,
  DISCOVERY_CONTRACT_VERSION,
  DISCOVERY_OPERATIONS,
  type DiscoveryAdapter,
  type DiscoveryOperation,
} from "./discovery.js";
import { brainstormingDiscoveryAdapter } from "./discovery.js";

export {
  adapterPlugins,
  checkAdapterReadiness,
  checkPluginBinding,
  mappingDigest,
  firstFailure,
  PROJECT_KNOWLEDGE_SETUP,
  pinMatches,
  sourceMatches,
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
  type SkillComposition,
  type ContentView,
  type WorkflowAdapter,
} from "./adapter.js";

export { renderSkill, type Rendered } from "./render.js";

export {
  EMPTY_LOCK,
  LOCK_FILE,
  lockText,
  parseLock,
  pinFor,
  bindingPins,
  pluginSourceChecksum,
  withPin,
  type OnboardedLock,
  type ParsedLock,
  type PluginPin,
  type ContentSource,
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
  discovery: brainstormingDiscoveryAdapter,
  "project-tracking": backlogTrackingAdapter,
  continuity: agentContinuityAdapter,
  implementation: superpowersImplementationAdapter,
});

export { IMPLEMENTATION_OPERATIONS, IMPLEMENTATION_CONTRACT_VERSION, superpowersImplementationAdapter, type ImplementationAdapter, type ImplementationOperation } from "./implementation.js";

export { CONTINUITY_OPERATIONS, CONTINUITY_CONTRACT_VERSION, agentContinuityAdapter, type ContinuityAdapter, type ContinuityOperation } from "./continuity.js";

const WORKFLOW_LOOKUP: ReadonlyMap<string, WorkflowAdapter<string>> = new Map(Object.entries(WORKFLOWS));

/** The adapter for a workflow name from untrusted input, or `undefined`. */
export const findWorkflow = (name: string): WorkflowAdapter<string> | undefined => WORKFLOW_LOOKUP.get(name);

const ACTIVE_ADAPTERS: readonly WorkflowAdapter<string>[] = Object.freeze(Object.values(WORKFLOWS));

/** Renders template skills from the active adapters (or the given ones) and the framework's lock; others pass through. Pure. */
export const assembleSkills = (
  skills: ReadonlyMap<string, string>,
  lock: OnboardedLock,
  adapters: readonly WorkflowAdapter<string>[] = ACTIVE_ADAPTERS,
): Assembled => assembleWith(skills, adapters, lock);

/** Copies a plugin source into a fresh staging directory with its template skills assembled. Release-time only. */
export const assemblePluginSource = (sourceRoot: string, stagingRoot: string): Assembled =>
  assembleSource(sourceRoot, stagingRoot, ACTIVE_ADAPTERS);

import {
  buildVendorBundle as buildWith,
  releasePayloads as releaseWith,
  withAssembledSource as stageWith,
  type PayloadReport,
  type ReleaseLayout,
  type Staged,
} from "./release.js";

export { SHIPPED_PLUGINS, withPayloadsRoot, type PayloadReport, type ReleaseLayout, type Staged } from "./release.js";

/** Runs `use` on a temporary, assembled copy of the plugin at `sourceRoot`, then removes the copy. */
export const withAssembledSource = <A>(sourceRoot: string, use: (assembledRoot: string) => A): Staged<A> =>
  stageWith(sourceRoot, ACTIVE_ADAPTERS, use);

/** Builds or verifies one host's payloads for every shipped plugin, assembled with the active adapters. */
export const releasePayloads = (operation: string, adapter: VendorAdapter, layout: ReleaseLayout): readonly PayloadReport[] =>
  releaseWith(operation, adapter, layout, ACTIVE_ADAPTERS);

/** Builds one host's bundle in memory from a plugin source checkout, assembled with the active adapters. */
export const buildVendorBundle = (sourceRoot: string, adapter: VendorAdapter): Result<VendorBundle> =>
  buildWith(sourceRoot, adapter, ACTIVE_ADAPTERS);

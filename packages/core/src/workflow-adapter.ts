import type { OnboardedPlugin } from "./onboarded.js";

/** A plugin skill that carries out part of a contract operation. */
export interface PluginSkillRef {
  readonly plugin: string;
  readonly skill: string;
}

/**
 * A workflow's adapter (ADR-001): its contract version and how plugins fulfil each operation.
 * `fulfil` is total over `Operation`, so an adapter missing an operation does not compile.
 */
export interface WorkflowAdapter<Operation extends string> {
  readonly workflow: string;
  readonly contractVersion: string;
  readonly fulfil: Readonly<Record<Operation, readonly PluginSkillRef[]>>;
}

/** Observed facts about one adapter's plugins. `pluginSkills` maps each installed plugin to its skill names. */
export interface ReadinessFacts {
  readonly adapter: WorkflowAdapter<string>;
  readonly onboarded: readonly OnboardedPlugin[];
  readonly pluginSkills: ReadonlyMap<string, readonly string[]>;
  readonly knowledgeRoots: { readonly project?: string; readonly review?: string };
}

export type ReadinessStep = "declared" | "installed" | "bound";

export type Readiness =
  | { readonly status: "ready" }
  | { readonly status: "not-ready"; readonly step: ReadinessStep; readonly reason: string };

const READY: Readiness = { status: "ready" };

const notReady = (step: ReadinessStep, reason: string): Readiness => ({ status: "not-ready", step, reason });

const refs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  Object.entries(adapter.fulfil).flatMap(([operation, served]) => served.map((ref) => [operation, ref] as const));

/** Each plugin an adapter references, once, in first-reference order. */
export const adapterPlugins = (adapter: WorkflowAdapter<string>): readonly string[] => [
  ...new Set(refs(adapter).map(([, { plugin }]) => plugin)),
];

/** Fails with `step` when `problems` is non-empty. */
const failWhen = (step: ReadinessStep, problems: readonly string[], describe: (list: string) => string): Readiness =>
  problems.length === 0 ? READY : notReady(step, describe(problems.join(", ")));

const checkDeclared = ({ adapter, onboarded }: ReadinessFacts): Readiness =>
  failWhen(
    "declared",
    adapterPlugins(adapter).filter(
      (plugin) => !onboarded.some(({ name, adapter: served }) => name === plugin && served === adapter.workflow),
    ),
    (list) => `The manifest does not declare ${list} for the ${adapter.workflow} adapter.`,
  );

const checkInstalled = ({ adapter, pluginSkills }: ReadinessFacts): Readiness =>
  failWhen(
    "installed",
    adapterPlugins(adapter).filter((plugin) => (pluginSkills.get(plugin) ?? []).length === 0),
    (list) => `No installed skills were found for ${list}.`,
  );

const checkMappedSkills = ({ adapter, pluginSkills }: ReadinessFacts): Readiness =>
  failWhen(
    "bound",
    refs(adapter)
      .filter(([, { plugin, skill }]) => !(pluginSkills.get(plugin) ?? []).includes(skill))
      .map(([operation, { plugin, skill }]) => `${plugin}:${skill} (${operation})`),
    (list) => `Installed plugins lack skills the adapter maps: ${list}.`,
  );

const checkKnowledge = ({ knowledgeRoots: { project, review } }: ReadinessFacts): Readiness =>
  project === undefined
    ? notReady("bound", "No project knowledge store is configured; run setup-project-knowledge.")
    : review === undefined || review === project
      ? READY
      : notReady("bound", `The project knowledge store (${project}) and the review toolkit's store (${review}) differ.`);

const CHECKS: readonly ((facts: ReadinessFacts) => Readiness)[] = [
  checkDeclared,
  checkInstalled,
  checkMappedSkills,
  checkKnowledge,
];

/** Checks each readiness step in order and reports the first failure. Pure. */
export const checkAdapterReadiness = (facts: ReadinessFacts): Readiness =>
  CHECKS.reduce<Readiness>((result, check) => (result.status === "ready" ? check(facts) : result), READY);

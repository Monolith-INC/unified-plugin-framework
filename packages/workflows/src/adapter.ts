import type { OnboardedPlugin, WorkflowName } from "@agent-plugins/core";

/** A plugin skill that carries out part of a contract operation. */
export interface PluginSkillRef {
  readonly plugin: string;
  readonly skill: string;
}

/** At least one value. */
export type NonEmpty<A> = readonly [A, ...A[]];

/** Where a plugin records its own knowledge store: a JSON file in the project and the key holding the store path. */
export interface PluginKnowledgeStore {
  readonly plugin: string;
  readonly file: string;
  readonly key: NonEmpty<string>;
}

/**
 * A workflow's adapter (ADR-001): its contract version, how plugins fulfil each operation, and where those plugins
 * keep their own knowledge store. `fulfil` is total and non-empty over `Operation`, so a missing or empty operation
 * does not compile.
 */
export interface WorkflowAdapter<Operation extends string> {
  readonly workflow: WorkflowName;
  readonly contractVersion: string;
  readonly fulfil: Readonly<Record<Operation, NonEmpty<PluginSkillRef>>>;
  readonly knowledgeStores: readonly PluginKnowledgeStore[];
}

/**
 * Observed facts about one adapter's plugins.
 * `pluginSkills` maps each installed plugin to its skill names; `pluginStores` maps each plugin to the store path it
 * records, `undefined` when it records none.
 */
export interface ReadinessFacts {
  readonly adapter: WorkflowAdapter<string>;
  readonly onboarded: readonly OnboardedPlugin[];
  readonly pluginSkills: ReadonlyMap<string, readonly string[]>;
  readonly projectStore: string | undefined;
  readonly pluginStores: ReadonlyMap<string, string | undefined>;
}

export type ReadinessStep = "declared" | "installed" | "bound";

export type Readiness =
  | { readonly status: "ready" }
  | { readonly status: "not-ready"; readonly step: ReadinessStep; readonly reason: string };

export interface Monoid<A> {
  readonly empty: A;
  readonly concat: (x: A, y: A) => A;
}

const READY: Readiness = { status: "ready" };

/** Combines readiness results keeping the leftmost failure; `READY` is the identity. */
export const firstFailure: Monoid<Readiness> = Object.freeze({
  empty: READY,
  concat: (x: Readiness, y: Readiness): Readiness => (x.status === "ready" ? y : x),
});

const notReady = (step: ReadinessStep, reason: string): Readiness => ({ status: "not-ready", step, reason });

const refs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  Object.entries(adapter.fulfil).flatMap(([operation, served]) => served.map((ref) => [operation, ref] as const));

/** Each plugin an adapter references, once, in first-reference order. */
export const adapterPlugins = (adapter: WorkflowAdapter<string>): readonly string[] => [
  ...new Set(refs(adapter).map(([, { plugin }]) => plugin)),
];

/** Fails at `step` when `problems` is non-empty. */
const failWhen = (step: ReadinessStep, problems: readonly string[], describe: (list: string) => string): Readiness =>
  problems.length === 0 ? READY : notReady(step, describe(problems.join("; ")));

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

const storeMismatch = (project: string, pluginStores: ReadonlyMap<string, string | undefined>) =>
  ({ plugin, file, key }: PluginKnowledgeStore): readonly string[] => {
    const root = pluginStores.get(plugin);
    return root === project
      ? []
      : [`${plugin} ${root === undefined ? "sets no store" : `uses ${root}`} in ${file} (${key.join(".")}); set it to ${project}`];
  };

const checkKnowledge = ({ adapter, projectStore, pluginStores }: ReadinessFacts): Readiness =>
  projectStore === undefined
    ? notReady("bound", "No project knowledge store is configured; run setup-project-knowledge.")
    : failWhen(
        "bound",
        adapter.knowledgeStores.flatMap(storeMismatch(projectStore, pluginStores)),
        (list) => `Plugins must share the project knowledge store: ${list}.`,
      );

const CHECKS: readonly ((facts: ReadinessFacts) => Readiness)[] = [
  checkDeclared,
  checkInstalled,
  checkMappedSkills,
  checkKnowledge,
];

/** Checks each readiness step in order and reports the first failure. Pure. */
export const checkAdapterReadiness = (facts: ReadinessFacts): Readiness =>
  CHECKS.map((check) => check(facts)).reduce(firstFailure.concat, firstFailure.empty);

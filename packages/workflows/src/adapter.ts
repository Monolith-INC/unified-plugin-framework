import type { OnboardedPlugin, WorkflowName } from "@agent-plugins/core";

/** A plugin skill that carries out part of a contract operation; `use` says when to choose it among several. */
export interface PluginSkillRef {
  readonly plugin: string;
  readonly skill: string;
  readonly use?: string;
}

/** At least one value. */
export type NonEmpty<A> = readonly [A, ...A[]];

/**
 * Where a plugin records its own knowledge store: a JSON file in the project, the key holding the store path, and the
 * plugin skill that sets it.
 */
export interface PluginKnowledgeStore {
  readonly plugin: string;
  readonly file: string;
  readonly key: NonEmpty<string>;
  readonly setup: string;
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

/** The framework skill that creates the shared project knowledge store. */
export const PROJECT_KNOWLEDGE_SETUP: PluginSkillRef = Object.freeze({
  plugin: "project-knowledge",
  skill: "setup-project-knowledge",
});

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

/** How to recover from a failed step: run a skill and continue, or ask the user for something only they can do. */
export type Recovery =
  | { readonly action: "run-skill"; readonly skill: PluginSkillRef; readonly goal: string }
  | { readonly action: "ask-user"; readonly message: string };

export type Readiness =
  | { readonly status: "ready" }
  | { readonly status: "not-ready"; readonly step: ReadinessStep; readonly reason: string; readonly recovery: Recovery };

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

const notReady = (step: ReadinessStep, reason: string, recovery: Recovery): Readiness => ({
  status: "not-ready",
  step,
  reason,
  recovery,
});

const askUser = (message: string): Recovery => ({ action: "ask-user", message });

const refs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  Object.entries(adapter.fulfil).flatMap(([operation, served]) => served.map((ref) => [operation, ref] as const));

/** Each plugin an adapter references, once, in first-reference order. */
export const adapterPlugins = (adapter: WorkflowAdapter<string>): readonly string[] => [
  ...new Set(refs(adapter).map(([, { plugin }]) => plugin)),
];

/** "name version from source" for each plugin, using the framework's declaration when there is one. */
const describePlugins = (plugins: readonly string[], onboarded: readonly OnboardedPlugin[]): string =>
  plugins
    .map((plugin) => onboarded.find(({ name }) => name === plugin))
    .map((declared, index) => (declared === undefined ? plugins[index] : `${declared.name} ${declared.version} from ${declared.source}`))
    .join("; ");

const checkDeclared = ({ adapter, onboarded }: ReadinessFacts): Readiness => {
  const undeclared = adapterPlugins(adapter).filter(
    (plugin) => !onboarded.some(({ name, adapter: served }) => name === plugin && served === adapter.workflow),
  );
  return undeclared.length === 0
    ? READY
    : notReady(
        "declared",
        `The framework manifest does not declare ${undeclared.join(", ")} for the ${adapter.workflow} adapter.`,
        askUser(`The framework package is incomplete: add ${undeclared.join(", ")} to onboardedPlugins for ${adapter.workflow}, or reinstall the framework.`),
      );
};

const checkInstalled = ({ adapter, onboarded, pluginSkills }: ReadinessFacts): Readiness => {
  const missing = adapterPlugins(adapter).filter((plugin) => (pluginSkills.get(plugin) ?? []).length === 0);
  return missing.length === 0
    ? READY
    : notReady(
        "installed",
        `No installed skills were found for ${missing.join(", ")}.`,
        askUser(`Install and enable ${describePlugins(missing, onboarded)} for this host, then continue.`),
      );
};

const checkMappedSkills = ({ adapter, onboarded, pluginSkills }: ReadinessFacts): Readiness => {
  const missing = refs(adapter).filter(([, { plugin, skill }]) => !(pluginSkills.get(plugin) ?? []).includes(skill));
  return missing.length === 0
    ? READY
    : notReady(
        "bound",
        `Installed plugins lack skills the adapter maps: ${missing.map(([operation, { plugin, skill }]) => `${plugin}:${skill} (${operation})`).join(", ")}.`,
        askUser(`Install a version of ${describePlugins([...new Set(missing.map(([, { plugin }]) => plugin))], onboarded)} that provides the mapped skills, then continue.`),
      );
};

const storeMismatch = (pluginStores: ReadonlyMap<string, string | undefined>, project: string) => (store: PluginKnowledgeStore) =>
  pluginStores.get(store.plugin) !== project;

const checkKnowledge = ({ adapter, projectStore, pluginStores }: ReadinessFacts): Readiness => {
  const mismatched = projectStore === undefined ? undefined : adapter.knowledgeStores.find(storeMismatch(pluginStores, projectStore));
  return projectStore === undefined
    ? notReady("bound", "No project knowledge store is configured.", {
        action: "run-skill",
        skill: PROJECT_KNOWLEDGE_SETUP,
        goal: "Create the project knowledge store with the recommended defaults.",
      })
    : mismatched === undefined
      ? READY
      : notReady(
          "bound",
          `${mismatched.plugin} ${pluginStores.get(mismatched.plugin) === undefined ? "sets no store" : `uses ${pluginStores.get(mismatched.plugin)}`} in ${mismatched.file} (${mismatched.key.join(".")}), not the project store ${projectStore}.`,
          {
            action: "run-skill",
            skill: { plugin: mismatched.plugin, skill: mismatched.setup },
            goal: `Set ${mismatched.key.join(".")} in ${mismatched.file} to ${projectStore}.`,
          },
        );
};

const CHECKS: readonly ((facts: ReadinessFacts) => Readiness)[] = [
  checkDeclared,
  checkInstalled,
  checkMappedSkills,
  checkKnowledge,
];

/** Checks each readiness step in order and reports the first failure with its recovery. Pure. */
export const checkAdapterReadiness = (facts: ReadinessFacts): Readiness =>
  CHECKS.map((check) => check(facts)).reduce(firstFailure.concat, firstFailure.empty);

import type { OnboardedPlugin, WorkflowName } from "@agent-plugins/core";

import { LOCK_FILE, mappingDigest, pinFor, satisfiesRange, type OnboardedLock } from "./lock.js";

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

/** An installed plugin as observed: its manifest version, its content checksum, and its skill names. */
export interface InstalledPlugin {
  readonly version: string;
  readonly checksum: string;
  readonly skills: readonly string[];
}

/** What the plugin side of a check needs: the adapter, the framework's declarations, and each installed plugin. */
export interface BindingFacts {
  readonly adapter: WorkflowAdapter<string>;
  readonly onboarded: readonly OnboardedPlugin[];
  readonly installed: ReadonlyMap<string, InstalledPlugin>;
}

/**
 * Observed facts about one adapter's plugins in a project: the binding facts, the framework's lock, and the knowledge
 * stores. `pluginStores` maps each plugin to the store path it records, `undefined` when it records none.
 */
export interface ReadinessFacts extends BindingFacts {
  readonly lock: OnboardedLock;
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

/** The setup skills the adapter's readiness recovery relies on, labelled like operations. */
const setupRefs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  adapter.knowledgeStores.map(({ plugin, setup }) => [`${plugin} knowledge store setup`, { plugin, skill: setup }] as const);

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

const declaration = (adapter: WorkflowAdapter<string>, onboarded: readonly OnboardedPlugin[], plugin: string) =>
  onboarded.find(({ name, adapter: served }) => name === plugin && served === adapter.workflow);

const checkDeclared = ({ adapter, onboarded }: BindingFacts): Readiness => {
  const undeclared = adapterPlugins(adapter).filter((plugin) => declaration(adapter, onboarded, plugin) === undefined);
  return undeclared.length === 0
    ? READY
    : notReady(
        "declared",
        `The framework manifest does not declare ${undeclared.join(", ")} for the ${adapter.workflow} adapter.`,
        askUser(`The framework package is incomplete: add ${undeclared.join(", ")} to onboardedPlugins for ${adapter.workflow}, or reinstall the framework.`),
      );
};

const checkInstalled = ({ adapter, onboarded, installed }: BindingFacts): Readiness => {
  const missing = adapterPlugins(adapter).filter((plugin) => (installed.get(plugin)?.skills ?? []).length === 0);
  return missing.length === 0
    ? READY
    : notReady(
        "installed",
        `No installed skills were found for ${missing.join(", ")}.`,
        askUser(`Install and enable ${describePlugins(missing, onboarded)} for this host, then continue.`),
      );
};

/** "plugin version (declared range)" for each installed plugin outside the range the framework declares for it. */
const outsideRange = ({ adapter, onboarded, installed }: BindingFacts): readonly string[] =>
  adapterPlugins(adapter).flatMap((plugin) => {
    const declared = declaration(adapter, onboarded, plugin);
    const version = installed.get(plugin)?.version;
    return declared === undefined || version === undefined || satisfiesRange(version, declared.version)
      ? []
      : [`${plugin} ${version} (declared ${declared.version})`];
  });

const checkInRange = (facts: BindingFacts): Readiness => {
  const outside = outsideRange(facts);
  return outside.length === 0
    ? READY
    : notReady(
        "installed",
        `Installed versions are outside the declared range: ${outside.join(", ")}.`,
        askUser(
          `Install a version inside the declared range, or check the new version with \`agent-plugin upgrade-check ${facts.adapter.workflow}\` and widen the range in the framework manifest.`,
        ),
      );
};

const short = (checksum: string): string => checksum.slice(0, 12);

/** Why an installed plugin does not match its pin, or `undefined` when it does. */
const pinProblem =
  ({ adapter, installed, lock }: ReadinessFacts) =>
  (plugin: string): string | undefined => {
    const pin = pinFor(lock, plugin);
    const found = installed.get(plugin);
    return found === undefined
      ? undefined
      : pin === undefined
        ? `${plugin} is not pinned in ${LOCK_FILE}`
        : pin.version !== found.version || pin.checksum !== found.checksum
          ? `${plugin} ${found.version} (${short(found.checksum)}) is installed, but ${LOCK_FILE} pins ${pin.version} (${short(pin.checksum)})`
          : pin.adapter !== adapter.workflow || pin.mappingDigest !== mappingDigest(adapter)
            ? `the ${adapter.workflow} mapping changed since ${plugin} ${pin.version} was pinned`
            : undefined;
  };

const checkPinned = (facts: ReadinessFacts): Readiness => {
  const problems = adapterPlugins(facts.adapter).flatMap((plugin) => pinProblem(facts)(plugin) ?? []);
  return problems.length === 0
    ? READY
    : notReady(
        "installed",
        `Installed plugins do not match ${LOCK_FILE}: ${problems.join("; ")}.`,
        askUser(
          `Install the pinned version, or check the installed one with \`agent-plugin upgrade-check ${facts.adapter.workflow}\` and commit the updated ${LOCK_FILE}.`,
        ),
      );
};

const checkMappedSkills = ({ adapter, onboarded, installed }: BindingFacts): Readiness => {
  const missing = [...refs(adapter), ...setupRefs(adapter)].filter(
    ([, { plugin, skill }]) => !(installed.get(plugin)?.skills ?? []).includes(skill),
  );
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

const firstOf = <F>(checks: readonly ((facts: F) => Readiness)[], facts: F): Readiness =>
  checks.map((check) => check(facts)).reduce(firstFailure.concat, firstFailure.empty);

const BINDING_CHECKS: readonly ((facts: BindingFacts) => Readiness)[] = [checkDeclared, checkInstalled, checkInRange, checkMappedSkills];

const READINESS_CHECKS: readonly ((facts: ReadinessFacts) => Readiness)[] = [
  checkDeclared,
  checkInstalled,
  checkInRange,
  checkPinned,
  checkMappedSkills,
  checkKnowledge,
];

/**
 * The plugin side of readiness, and the upgrade gate (ADR-001): the plugins are declared, installed inside their
 * declared range, and provide every skill the adapter maps. Pure.
 */
export const checkPluginBinding = (facts: BindingFacts): Readiness => firstOf(BINDING_CHECKS, facts);

/** Checks each readiness step in order, including the lock and the knowledge stores, and reports the first failure. Pure. */
export const checkAdapterReadiness = (facts: ReadinessFacts): Readiness => firstOf(READINESS_CHECKS, facts);

import { declaredWorkflows, type OnboardedPlugin, type WorkflowName } from "@agent-plugins/core";

import { sha256, stableJson } from "@agent-plugins/compiler";

import { LOCK_FILE, bindingPins, pinFor, type ContentSource, type OnboardedLock, type PluginPin } from "./lock.js";
import type { Question } from "./questions.js";
import { parseRange, satisfies } from "./versions.js";

/** A plugin skill that carries out part of a contract operation; `use` says when to choose it among several. */
export type PluginSkillRef = {
  readonly plugin: string;
  readonly skill: string;
  readonly use?: string;
  readonly group?: string;
};

/** At least one value. */
export type NonEmpty<A> = readonly [A, ...A[]];

/**
 * Where a plugin records its own knowledge store: a JSON file in the project, the key holding the store path, and the
 * plugin skill that sets it.
 */
export type PluginKnowledgeStore = {
  readonly plugin: string;
  readonly file: string;
  readonly key: NonEmpty<string>;
  readonly setup: string;
};

/**
 * How an operation's plugin skills combine: `one-of` hands the work to the one that fits (each `use` says when);
 * `lead-and-layers` runs the first skill throughout and adds the others at the stages their `use` names.
 */
export type SkillComposition = "one-of" | "lead-and-layers" | "content-view";

/** A reviewed excerpt of a published file; the source digest gates its use on upgrades. */
export type ContentView = {
  readonly plugin: string;
  readonly skill: string;
  readonly path: string;
  readonly heading: string;
  readonly sourceDigest: string;
  readonly content: string;
};

/**
 * A workflow's adapter (ADR-001): its contract version, how plugins fulfil each operation and how those skills
 * combine, optional skills the user may add, which plugins' skills are invoked without a plugin prefix, and where
 * the plugins keep their own knowledge store. `fulfil` is total and non-empty over `Operation`, so a missing or empty
 * operation does not compile.
 */
export type WorkflowAdapter<Operation extends string> = {
  readonly workflow: WorkflowName;
  readonly contractVersion: string;
  readonly composition: SkillComposition;
  readonly fulfil: Readonly<Record<Operation, NonEmpty<PluginSkillRef>>>;
  readonly catalog: readonly PluginSkillRef[];
  readonly bareSkillPlugins: readonly string[];
  readonly knowledgeStores: readonly PluginKnowledgeStore[];
  readonly supportSkills?: readonly PluginSkillRef[];
  readonly contentViews?: readonly ContentView[];
  readonly protocol?: string;
};

/**
 * Project-local Agent Skills identifier for a dependency skill: preserves its exact upstream kebab-case name unless it
 * collides with a framework contract operation, in which case it prefixes `<plugin>-` so both live side by side under
 * `.agents/skills/` and `.claude/skills/` without colons or double hyphens.
 */
export const projectSkillName = (
  ref: Pick<PluginSkillRef, "plugin" | "skill">,
  contractOperations: ReadonlySet<string>,
): string => (contractOperations.has(ref.skill) ? `${ref.plugin}-${ref.skill}` : ref.skill);

/** The onboarded standalone skill that creates the shared project knowledge store. */
export const PROJECT_KNOWLEDGE_SETUP: PluginSkillRef = Object.freeze({
  plugin: "monolithic-agent-knowledge-store",
  skill: "setup-project-knowledge",
});

/** The onboarded standalone skill that populates the shared project knowledge store. */
export const PROJECT_KNOWLEDGE_DISCOVER: PluginSkillRef = Object.freeze({
  plugin: "monolithic-agent-knowledge-store",
  skill: "discover-project-knowledge",
});

/** An installed plugin as observed: its manifest version, its content checksum, and its skill names. */
export interface InstalledPlugin {
  readonly version: string;
  readonly checksum: string;
  readonly skills: readonly string[];
  readonly contentSource?: ContentSource;
}

/** What the plugin side of a check needs: the adapter, the framework's declarations and lock, and each installed plugin. */
export interface BindingFacts {
  readonly adapter: WorkflowAdapter<string>;
  readonly onboarded: readonly OnboardedPlugin[];
  readonly lock: OnboardedLock;
  readonly installed: ReadonlyMap<string, InstalledPlugin>;
}

/**
 * Observed facts about one adapter's plugins in a project: the binding facts and the knowledge stores. `pluginStores`
 * maps each plugin to the store path it records, `undefined` when it records none.
 */
export interface ReadinessFacts extends BindingFacts {
  readonly projectStore: string | undefined;
  readonly pluginStores: ReadonlyMap<string, string | undefined>;
}

export type ReadinessStep = "declared" | "installed" | "bound";

/** How to recover from a failed step: run a skill and continue, or ask the user for something only they can do. */
export type Recovery =
  | { readonly action: "run-skill"; readonly skill: PluginSkillRef; readonly goal: string }
  | { readonly action: "ask-user"; readonly message: string; readonly question?: Question };

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

const askUser = (message: string, question?: Question): Recovery =>
  question === undefined ? { action: "ask-user", message } : { action: "ask-user", message, question };

const refs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  Object.entries(adapter.fulfil).flatMap(([operation, served]) => served.map((ref) => [operation, ref] as const));

/** The optional skills the user may add, labelled like operations. */
const catalogRefs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  adapter.catalog.map((ref) => ["catalog", ref] as const);

/** The setup skills the adapter's readiness recovery relies on, labelled like operations. */
const setupRefs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  adapter.knowledgeStores.map(({ plugin, setup }) => [`${plugin} knowledge store setup`, { plugin, skill: setup }] as const);

/** Support skills installed beside mapped skills (such as runtime hubs and module manifests). */
const supportRefs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] =>
  (adapter.supportSkills ?? []).map((ref) => ["support", ref] as const);

/** Every plugin skill a session of this adapter may use: its operations, its catalog, its recovery setup skills and support skills. */
const requiredRefs = (adapter: WorkflowAdapter<string>): readonly (readonly [string, PluginSkillRef])[] => [
  ...refs(adapter),
  ...catalogRefs(adapter),
  ...setupRefs(adapter),
  ...supportRefs(adapter),
];

/** Each plugin an adapter needs, once, in first-reference order. */
export const adapterPlugins = (adapter: WorkflowAdapter<string>): readonly string[] => [
  ...new Set(requiredRefs(adapter).map(([, { plugin }]) => plugin)),
];

/** "name version from source" for each plugin, using the framework's declaration when there is one. */
const describePlugins = (plugins: readonly string[], onboarded: readonly OnboardedPlugin[]): string =>
  plugins
    .map((plugin) => onboarded.find(({ name }) => name === plugin))
    .map((declared, index) => (declared === undefined ? plugins[index] : `${declared.name} ${declared.version} from ${declared.source}`))
    .join("; ");

const declaration = (adapter: WorkflowAdapter<string>, onboarded: readonly OnboardedPlugin[], plugin: string) =>
  onboarded.find((entry) => entry.name === plugin && declaredWorkflows(entry).includes(adapter.workflow));

/** A digest of the whole adapter, so any change to its contract or mapping invalidates the pins made against it. */
export const mappingDigest = (adapter: WorkflowAdapter<string>): string => sha256(stableJson(adapter));

const UPGRADE_CHECK = (workflow: string): string =>
  `\`agent-plugin upgrade-check ${workflow} --framework <framework plugin> --plugin-root <candidate plugin>\``;

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

/** A declared range this framework cannot read is a manifest problem, not an installed version outside it. */
const checkRangeSyntax = ({ adapter, onboarded }: BindingFacts): Readiness => {
  const unreadable = adapterPlugins(adapter).flatMap((plugin) => {
    const declared = declaration(adapter, onboarded, plugin);
    return declared === undefined || parseRange(declared.version) !== undefined ? [] : [`${plugin} "${declared.version}"`];
  });
  return unreadable.length === 0
    ? READY
    : notReady(
        "declared",
        `The framework manifest declares unsupported version ranges: ${unreadable.join(", ")}.`,
        askUser("Declare each onboarded plugin's version as x.y.z, ^x.y.z or ~x.y.z in the framework manifest."),
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
    const range = declared === undefined ? undefined : parseRange(declared.version);
    const version = installed.get(plugin)?.version;
    return range === undefined || version === undefined || satisfies(version, range)
      ? []
      : [`${plugin} ${version} (declared ${declared?.version ?? ""})`];
  });

const versionRecoveryQuestion = (workflow: string): Question =>
  Object.freeze({
    kind: "single",
    explanation: `The installed plugin version for ${workflow} does not match the framework pin. How would you like to proceed?`,
    options: Object.freeze([
      Object.freeze({ label: "Install the pinned version", description: "Match the tested version recorded by the framework.", recommended: true }),
      Object.freeze({ label: "Check and adopt the newer version", description: "Run the upgrade check before updating the lock." }),
    ] as const),
    allowOther: true,
  });

const checkInRange = (facts: BindingFacts): Readiness => {
  const outside = outsideRange(facts);
  return outside.length === 0
    ? READY
    : notReady(
        "installed",
        `Installed versions are outside the declared range: ${outside.join(", ")}.`,
        askUser(
          `Install a version inside the declared range. To adopt the newer one, widen the range in the framework manifest first, then run ${UPGRADE_CHECK(facts.adapter.workflow)} and commit the updated ${LOCK_FILE}.`,
          versionRecoveryQuestion(facts.adapter.workflow),
        ),
      );
};

const short = (checksum: string): string => checksum.slice(0, 12);

/** How an installed plugin differs from its pin; each kind has its own recovery. */
type PinProblem = { readonly kind: "unpinned" | "content-changed" | "other-version" | "mapping-changed"; readonly text: string };

/** Same version, different content: a release changed under its own version number. */
const contentChanged = (pin: PluginPin, found: InstalledPlugin): boolean =>
  pin.version === found.version && pin.checksum !== found.checksum && !unchangedSource(pin.contentSource, found.contentSource);

/** Adding reviewed files changes coverage, not the release; every previously pinned byte still must match. */
const unchangedSource = (before: ContentSource | undefined, after: ContentSource | undefined): boolean =>
  before !== undefined && after !== undefined && before.checksum === after.checksum
  && Object.entries(before.files).every(([path, digest]) => after.files[path] === digest);

/** Selection growth is independent of source identity; all previously reviewed files must still agree. */
export const sourceMatches = (pin: PluginPin, found: InstalledPlugin): boolean => pin.version === found.version
  && (pin.checksum === found.checksum || unchangedSource(pin.contentSource, found.contentSource)
    || pin.contentSource === undefined && found.contentSource?.checksum === pin.checksum);

/** Whether `found` is the source `lock` pins for `plugin` under `workflow`; absence on either side is a mismatch. */
export const pinMatches = (lock: OnboardedLock, workflow: WorkflowName, plugin: string, found: InstalledPlugin | undefined): boolean => {
  const pin = pinFor(lock, plugin, workflow);
  return pin !== undefined && found !== undefined && sourceMatches(pin, found);
};

const contentChangedText = (plugin: string, pin: PluginPin, found: InstalledPlugin): string =>
  `${plugin} ${found.version} (${short(found.checksum)}) is installed, but ${LOCK_FILE} pins ${pin.version} (${short(pin.checksum)})`;

/** Why an installed plugin does not match its pin, or `undefined` when it does. */
const pinProblem =
  ({ adapter, installed, lock }: BindingFacts) =>
  (plugin: string): PinProblem | undefined => {
    const pin = pinFor(lock, plugin, adapter.workflow);
    const found = installed.get(plugin);
    return found === undefined
      ? undefined
      : pin === undefined
        ? { kind: "unpinned", text: `${plugin} is not pinned in ${LOCK_FILE}` }
        : contentChanged(pin, found) && !sourceMatches(pin, found)
          ? { kind: "content-changed", text: contentChangedText(plugin, pin, found) }
          : pin.version !== found.version
            ? { kind: "other-version", text: contentChangedText(plugin, pin, found) }
            : !sourceMatches(pin, found) || pin.mappingDigest !== mappingDigest(adapter) || pin.contractVersion !== adapter.contractVersion
              ? { kind: "mapping-changed", text: `the ${adapter.workflow} contract or mapping changed since ${plugin} ${pin.version} was pinned` }
              : undefined;
  };

const PIN_RECOVERY: ReadonlyMap<PinProblem["kind"], (workflow: string) => string> = new Map([
  [
    "content-changed",
    () =>
      "Reinstall the pinned release: its content differs from the lock under the same version number. A plugin without a manifest is taken to be its declared range's starting version unless given one; for a newer release, give its version as --plugin-root <plugin>@<version>=<dir>.",
  ],
  ["other-version", (workflow: string) => `Install the pinned version, or check the installed one with ${UPGRADE_CHECK(workflow)} and commit the updated ${LOCK_FILE}.`],
  ["unpinned", (workflow: string) => `Pin it with ${UPGRADE_CHECK(workflow)} and commit the updated ${LOCK_FILE}.`],
  ["mapping-changed", (workflow: string) => `Re-pin against the current mapping with ${UPGRADE_CHECK(workflow)} and commit the updated ${LOCK_FILE}.`],
]);

const checkPinned = (facts: BindingFacts): Readiness => {
  const problems = adapterPlugins(facts.adapter).flatMap((plugin) => pinProblem(facts)(plugin) ?? []);
  const [first] = problems;
  return first === undefined
    ? READY
    : notReady(
        "installed",
        `Installed plugins do not match ${LOCK_FILE}: ${problems.map(({ text }) => text).join("; ")}.`,
        askUser(
          PIN_RECOVERY.get(first.kind)?.(facts.adapter.workflow) ?? "",
          first.kind === "other-version" ? versionRecoveryQuestion(facts.adapter.workflow) : undefined,
        ),
      );
};

/** The upgrade gate refuses a candidate whose content changed under the version the lock already pins. */
const checkSameVersionContent = (facts: BindingFacts): Readiness => {
  const changed = adapterPlugins(facts.adapter).flatMap((plugin) => {
    const found = facts.installed.get(plugin);
    return found === undefined ? [] : facts.lock.plugins.filter((pin) => pin.plugin === plugin).flatMap(bindingPins)
      .filter((pin) => contentChanged(pin, found) && !sourceMatches(pin, found)).map((pin) => contentChangedText(plugin, pin, found));
  });
  return changed.length === 0
    ? READY
    : notReady(
        "installed",
        `A release must not change under its own version: ${changed.join("; ")}.`,
        askUser(
          "Check the candidate against the published release, or publish the change as a new version. A plugin without a manifest is taken to be its declared range's starting version unless given one; for a newer release, give its version as --plugin-root <plugin>@<version>=<dir>.",
        ),
      );
};

const checkMappedSkills = ({ adapter, onboarded, installed }: BindingFacts): Readiness => {
  const missing = requiredRefs(adapter).filter(
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

const checkContentViews = ({ adapter, installed }: BindingFacts): Readiness => {
  const changed = (adapter.contentViews ?? []).filter((view) => installed.get(view.plugin)?.contentSource?.files[view.path] !== view.sourceDigest);
  return changed.length === 0 ? READY : notReady("bound",
    `Published content differs from the reviewed view: ${changed.map(({ path }) => path).join(", ")}.`,
    askUser("Use the pinned release, or rebuild and review the content selections from the new release before re-pinning. Keep the draft and resume afterwards."));
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

const BINDING_CHECKS: readonly ((facts: BindingFacts) => Readiness)[] = [
  checkDeclared,
  checkRangeSyntax,
  checkInstalled,
  checkInRange,
  checkSameVersionContent,
  checkMappedSkills,
  checkContentViews,
];

// Listed in full rather than appended to BINDING_CHECKS: the pin check belongs to the installed step, before bound.
const READINESS_CHECKS: readonly ((facts: ReadinessFacts) => Readiness)[] = [
  checkDeclared,
  checkRangeSyntax,
  checkInstalled,
  checkInRange,
  checkPinned,
  checkMappedSkills,
  checkContentViews,
  checkKnowledge,
];

/**
 * The plugin side of readiness, and the upgrade gate (ADR-001): the plugins are declared with a readable range,
 * installed inside it without changing content under a pinned version, and provide every skill the adapter maps. Pure.
 */
export const checkPluginBinding = (facts: BindingFacts): Readiness => firstOf(BINDING_CHECKS, facts);

/** Checks each readiness step in order, including the lock and the knowledge stores, and reports the first failure. Pure. */
export const checkAdapterReadiness = (facts: ReadinessFacts): Readiness => firstOf(READINESS_CHECKS, facts);

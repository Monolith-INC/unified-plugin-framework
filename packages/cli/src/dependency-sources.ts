import { join } from "node:path";
import { collect, fail, ok, type Result } from "@agent-plugins/project";
import { adapterPlugins, findWorkflow, LOCK_FILE, pinMatches, type OnboardedLock, type WorkflowAdapter } from "@agent-plugins/workflows";
import type { OnboardedPlugin } from "@agent-plugins/core";
import { gatherBinding, lockFrom, type PluginFactsIo, type PluginRootArg } from "./plugin-facts.js";

/**
 * Where one onboarded plugin's pinned release is published. A pin maps to the `v<version>` tag unless the
 * declaration names a ref (`github:owner/repo[/folder]#<ref>`); `path` is the plugin's folder in that checkout.
 */
export type DependencySource = {
  readonly plugin: string;
  readonly version: string;
  readonly repository: string;
  readonly ref: string;
  readonly path: string;
};

/** Fetches `source.ref` into the empty directory `into`; git at the edge, a fake in tests. */
export interface SourceFetcher {
  readonly fetch: (source: DependencySource, into: string) => Promise<Result<string>>;
}

/** Each part starts with a letter or digit, so no value can be read as a git option or climb out of the checkout. */
const GITHUB = /^github:([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)((?:\/[A-Za-z0-9][\w.-]*)*)(?:#([A-Za-z0-9][\w./-]*))?$/;
const climbs = (text: string): boolean => text.split("/").some((part) => part === "..");

/** A declared `github:` source at an exact version, or `undefined` when the declaration is not one. */
export const parseSource = (plugin: string, version: string, declared: string): DependencySource | undefined => {
  const [, owner = "", repo = "", folder = "", ref] = GITHUB.exec(declared) ?? [];
  return owner === "" || climbs(folder) || climbs(ref ?? "") ? undefined
    : { plugin, version, repository: `https://github.com/${owner}/${repo}.git`, ref: ref ?? `v${version}`, path: folder.slice(1) };
};

/** The onboarded plugins the selected workflows need, each once. */
export const selectedPlugins = (workflows: readonly string[]): readonly string[] => [...new Set(workflows.flatMap((name) => {
  const adapter = findWorkflow(name);
  return adapter === undefined ? [] : adapterPlugins(adapter);
}))];

/** The plugin a root provides: the name given, else its own manifest's; `undefined` when neither says. */
export const rootPluginName = (io: PluginFactsIo, root: PluginRootArg): string | undefined => {
  const read = root.name === undefined ? io.readPlugin(root.path) : undefined;
  return root.name ?? (read?.ok === true ? read.value.name : undefined);
};

const unfetchable = (plugin: string): Result<never> => fail("dependency-source", `${plugin} has no fetchable pinned source.`,
  `Declare its source as github:<owner>/<repo>[/<folder>][#<ref>] with a pin in ${LOCK_FILE}, or give its root in pluginRoots.`);
const unnamedRoot = (root: PluginRootArg): Result<never> => fail("dependency-source", `Plugin root ${root.path} is missing or names no plugin.`,
  "Correct the path, or name it as <plugin>[@<version>]=<dir>; nothing was fetched.");

const sourceOf = (onboarded: readonly OnboardedPlugin[], lock: OnboardedLock) => (plugin: string): Result<DependencySource> => {
  const version = lock.plugins.find((pin) => pin.plugin === plugin)?.version;
  const declared = onboarded.find(({ name }) => name === plugin)?.source;
  const source = version === undefined || declared === undefined ? undefined : parseSource(plugin, version, declared);
  return source === undefined ? unfetchable(plugin) : ok(source);
};

/** Sources to fetch: every selected plugin that no explicit root provides. Pure over the framework's declarations. */
export const plannedSources = (onboarded: readonly OnboardedPlugin[], lock: OnboardedLock, plugins: readonly string[],
  explicit: readonly string[]): Result<readonly DependencySource[]> =>
  collect(plugins.filter((plugin) => !explicit.includes(plugin)).map(sourceOf(onboarded, lock)));

/** Explicit roots' plugins; an unreadable unnamed root is reported rather than silently replaced by a fetch. */
const explicitPlugins = (io: PluginFactsIo, roots: readonly PluginRootArg[]): Result<readonly string[]> =>
  collect(roots.map((root) => {
    const name = rootPluginName(io, root);
    return name === undefined ? unnamedRoot(root) : ok(name);
  }));

/** The fetch plan for a framework and its selected workflows, read through `io`. */
export const sourcesFor = (io: PluginFactsIo, framework: string, workflows: readonly string[],
  roots: readonly PluginRootArg[]): Result<readonly DependencySource[]> => {
  const lock = lockFrom(io, framework);
  const explicit = explicitPlugins(io, roots);
  return lock.kind === "config-error" ? fail("dependency-source", lock.problems.join(" "), `Restore a valid ${LOCK_FILE} beside the framework manifest.`)
    : !explicit.ok ? explicit
      : plannedSources(io.inspectPlugin(framework).onboardedPlugins ?? [], lock.facts, selectedPlugins(workflows), explicit.value);
};

/** A source's cached checkout, keyed by plugin and pinned version. */
export const checkoutDir = (cache: string, source: DependencySource): string => join(cache, `${source.plugin}@${source.version}`);
/** The plugin root inside a checkout. */
export const sourceRoot = (checkout: string, source: DependencySource): string => join(checkout, source.path);
/** A fetched root in the `pluginRoots` syntax, so fetched and explicit roots pass the same binding gate. */
export const rootArg = (cache: string, source: DependencySource): string =>
  `${source.plugin}@${source.version}=${sourceRoot(checkoutDir(cache, source), source)}`;

const mismatch = (source: DependencySource, detail: readonly string[]): Result<never> => fail("dependency-fetch-mismatch",
  `${source.plugin} at ${source.ref} from ${source.repository} does not match its ${LOCK_FILE} pin (${detail.join("; ")}).`,
  `Nothing was staged and the fetched copy was discarded. Check that the declared source and ref publish pinned release ${source.version}, re-pin it through upgrade-check, or give a matching root in pluginRoots.`);

/** Why one workflow's pin rejects the tree at `root`; empty when it accepts it. */
const problemsFor = (io: PluginFactsIo, framework: string, source: DependencySource, root: string) =>
  (adapter: WorkflowAdapter<string>): readonly string[] => {
    const gathered = gatherBinding(io, adapter, framework, [{ path: root, name: source.plugin, version: source.version }]);
    switch (gathered.kind) {
      case "config-error": return gathered.problems;
      case "facts": return pinMatches(gathered.facts.lock, adapter.workflow, source.plugin, gathered.facts.installed.get(source.plugin))
        ? [] : [`for ${adapter.workflow}`];
    }
  };

/** Every selected workflow's pin must accept the tree at `root` before it is cached or staged. */
export const verifySource = (io: PluginFactsIo, framework: string, workflows: readonly string[]) =>
  (source: DependencySource, root: string): Result<string> => {
    const problems = workflows.flatMap((name) => findWorkflow(name) ?? [])
      .filter((adapter) => adapterPlugins(adapter).includes(source.plugin))
      .flatMap(problemsFor(io, framework, source, root));
    return problems.length === 0 ? ok(root) : mismatch(source, problems);
  };

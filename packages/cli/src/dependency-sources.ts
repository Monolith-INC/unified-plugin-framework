import { join } from "node:path";
import { fail, ok, type Result } from "@agent-plugins/project";
import { adapterPlugins, findWorkflow, LOCK_FILE, pinFor, sourceMatches, type OnboardedLock } from "@agent-plugins/workflows";
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

const unfetchable = (plugin: string): Result<never> => fail("dependency-source", `${plugin} has no fetchable pinned source.`,
  `Declare its source as github:<owner>/<repo>[/<folder>][#<ref>] with a pin in ${LOCK_FILE}, or give its root in pluginRoots.`);

const sourceOf = (onboarded: readonly OnboardedPlugin[], lock: OnboardedLock) => (plugin: string): Result<DependencySource> => {
  const version = lock.plugins.find((pin) => pin.plugin === plugin)?.version;
  const declared = onboarded.find(({ name }) => name === plugin)?.source;
  const source = version === undefined || declared === undefined ? undefined : parseSource(plugin, version, declared);
  return source === undefined ? unfetchable(plugin) : ok(source);
};

/** Sources to fetch: every selected plugin that no explicit root provides. Pure over the framework's declarations. */
export const plannedSources = (onboarded: readonly OnboardedPlugin[], lock: OnboardedLock, plugins: readonly string[],
  explicit: readonly string[]): Result<readonly DependencySource[]> => {
  const planned = plugins.filter((plugin) => !explicit.includes(plugin)).map(sourceOf(onboarded, lock));
  return planned.find(failed) ?? ok(planned.flatMap((result) => result.ok ? [result.value] : []));
};
type Failed = Extract<Result<unknown>, { readonly ok: false }>;
const failed = <A>(result: Result<A>): result is Failed & Result<A> => !result.ok;

/** The plugins explicit roots provide: by the name given, else by the root's own manifest. */
export const explicitPlugins = (io: PluginFactsIo, roots: readonly PluginRootArg[]): readonly string[] => roots.flatMap((root) => {
  const read = root.name === undefined ? io.readPlugin(root.path) : undefined;
  return root.name ?? (read?.ok === true && read.value.name !== undefined ? [read.value.name] : []);
});

/** The fetch plan for a framework and its selected workflows, read through `io`. */
export const sourcesFor = (io: PluginFactsIo, framework: string, workflows: readonly string[],
  roots: readonly PluginRootArg[]): Result<readonly DependencySource[]> => {
  const lock = lockFrom(io, framework);
  return lock.kind === "facts"
    ? plannedSources(io.inspectPlugin(framework).onboardedPlugins ?? [], lock.facts, selectedPlugins(workflows), explicitPlugins(io, roots))
    : fail("dependency-source", lock.problems.join(" "), `Restore a valid ${LOCK_FILE} beside the framework manifest.`);
};

/** A source's cached checkout, keyed by plugin and pinned version. */
export const checkoutDir = (cache: string, source: DependencySource): string => join(cache, `${source.plugin}@${source.version}`);
/** The plugin root inside a checkout. */
export const sourceRoot = (checkout: string, source: DependencySource): string => join(checkout, source.path);
/** A fetched root in the `pluginRoots` syntax, so fetched and explicit roots pass the same binding gate. */
export const rootArg = (cache: string, source: DependencySource): string =>
  `${source.plugin}@${source.version}=${sourceRoot(checkoutDir(cache, source), source)}`;

const mismatch = (source: DependencySource, detail: string): Result<never> => fail("dependency-fetch-mismatch",
  `${source.plugin} at ${source.ref} from ${source.repository} does not match its ${LOCK_FILE} pin${detail}.`,
  `Nothing was staged and the fetched copy was discarded. Check that the declared source and ref publish pinned release ${source.version}, re-pin it through upgrade-check, or give a matching root in pluginRoots.`);

/** Every selected workflow's pin must accept the fetched tree before it is cached or staged. */
export const verifySource = (io: PluginFactsIo, framework: string, workflows: readonly string[], source: DependencySource,
  root: string): Result<string> => {
  const problems = workflows.flatMap((name) => {
    const adapter = findWorkflow(name);
    const gathered = adapter === undefined || !adapterPlugins(adapter).includes(source.plugin) ? undefined
      : gatherBinding(io, adapter, framework, [{ path: root, name: source.plugin, version: source.version }]);
    const pin = gathered?.kind === "facts" ? pinFor(gathered.facts.lock, source.plugin, gathered.facts.adapter.workflow) : undefined;
    const found = gathered?.kind === "facts" ? gathered.facts.installed.get(source.plugin) : undefined;
    return gathered === undefined ? [] : gathered.kind === "config-error" ? gathered.problems
      : pin === undefined || found === undefined || !sourceMatches(pin, found) ? [`for ${name}`] : [];
  });
  return problems.length === 0 ? ok(root) : mismatch(source, ` (${problems.join("; ")})`);
};

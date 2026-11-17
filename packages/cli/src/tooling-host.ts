import { cp, readdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_TOOLING, codexToolingRegistration, mergeCodexMarketplace } from "@agent-plugins/adapter-codex";
import { fail, nodeProjectFiles, object, ok, type Result } from "@agent-plugins/project";
import { adapterPlugins, findWorkflow, LOCK_FILE, parseLock, pinMatches, type BindingFacts } from "@agent-plugins/workflows";
import { rootArg, rootPluginName, selectedPlugins, sourcesFor, verifySource, type DependencySource, type SourceFetcher } from "./dependency-sources.js";
import { fetchSources, GIT_FETCHER, unfetched, type FetchContext } from "./dependency-fetch.js";
import type { BootstrapInput } from "./tooling-input.js";
import { gatherBinding, parseRootArgs, type PluginRootArg } from "./plugin-facts.js";
import { NODE_PLUGIN_FACTS_IO, readContentTree } from "./plugin-reader.js";
import { checkPluginBinding } from "@agent-plugins/workflows";
import { command, hostRequest, sequence } from "./tooling-process.js";
import { directory, readText, readToml, safePath, setupFailure, writeText } from "./tooling-files.js";

export const FRAMEWORK_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const toolsRoot = (project: string): string => join(project, ".upf-tools");
export const marketplaceRoot = toolsRoot;
export const pluginTarget = (project: string, name: string): string => join(toolsRoot(project), "plugins", name);
export const pluginNames = (input: BootstrapInput): readonly string[] => selectedPlugins(input.workflows);
const FRAMEWORK_PLUGIN = join(FRAMEWORK_ROOT, "plugins/unified-plugin-framework");
/** Verified checkouts of fetched dependency sources, one per plugin and pinned version. */
export const sourcesRoot = (project: string): string => join(toolsRoot(project), "sources");

/** Selected plugins without an explicit root, each with its declared source at the pinned version. */
export const dependencySources = (project: string, input: BootstrapInput): Result<readonly DependencySource[]> => {
  const roots = parseRootArgs(project, input.pluginRoots);
  return roots.ok ? sourcesFor(NODE_PLUGIN_FACTS_IO, FRAMEWORK_PLUGIN, input.workflows, roots.roots) : setupFailure(roots.message);
};
/** Explicit roots as given, plus the cached checkout for every plugin bootstrap fetches; both pass one binding gate.
 * A plan that cannot be made leaves the input as given: the dependencies step reports why. */
export const resolvedInput = (project: string, input: BootstrapInput): BootstrapInput => {
  const sources = dependencySources(project, input);
  return sources.ok ? { ...input, pluginRoots: [...input.pluginRoots, ...sources.value.map((source) => rootArg(sourcesRoot(project), source))] } : input;
};
/** Sources still to fetch, so a fresh project's dependencies are missing rather than misconfigured. */
export const pendingSources = (project: string, input: BootstrapInput): Promise<Result<readonly DependencySource[]>> => {
  const sources = dependencySources(project, input);
  return sources.ok ? unfetched(fetchContext(project, input, GIT_FETCHER), sources.value).then(ok) : Promise.resolve(sources);
};
const fetchContext = (project: string, input: BootstrapInput, fetcher: SourceFetcher): FetchContext => ({ project, cache: sourcesRoot(project),
  verify: verifySource(NODE_PLUGIN_FACTS_IO, FRAMEWORK_PLUGIN, input.workflows), fetcher });
const fetchDependencies = (project: string, input: BootstrapInput, fetcher: SourceFetcher): Promise<Result<string>> => {
  const sources = dependencySources(project, input);
  return sources.ok ? fetchSources(fetchContext(project, input, fetcher), sources.value) : Promise.resolve(sources);
};

export const pluginBindings = (project: string, input: BootstrapInput): Result<readonly BindingFacts[]> => {
  const parsed = parseRootArgs(project, input.pluginRoots);
  const bindings = input.workflows.map((name) => {
    const adapter = findWorkflow(name);
    return parsed.ok && adapter !== undefined ? gatherBinding(NODE_PLUGIN_FACTS_IO, adapter,
      FRAMEWORK_PLUGIN, parsed.roots) : undefined;
  });
  const problem = bindings.find((binding) => binding?.kind !== "facts");
  return !parsed.ok || problem !== undefined || bindings.some((binding) => binding === undefined)
    ? fail("dependency-source", "A selected dependency root is missing or unreadable.", "Provide clean published roots for every selected workflow using the same syntax as adapter-check; preserve dependency sources.")
    : checkedBindings(bindings.flatMap((binding) => binding?.kind === "facts" ? [binding.facts] : []));
};
const checkedBindings = (bindings: readonly BindingFacts[]): Result<readonly BindingFacts[]> => {
  const failed = bindings.map(checkPluginBinding).find((result) => result.status !== "ready");
  const unpinned = bindings.flatMap(({ adapter, installed, lock }) => adapterPlugins(adapter)
    .filter((name) => !pinMatches(lock, adapter.workflow, name, installed.get(name))));
  return failed?.status === "not-ready" ? fail("dependency-binding", failed.reason,
    failed.recovery.action === "ask-user" ? failed.recovery.message : failed.recovery.goal)
    : unpinned.length > 0 ? fail("dependency-pin", `Selected sources differ from their exact pins: ${unpinned.join(", ")}.`,
      "Use the published pinned source, or complete the normal reviewed upgrade-check process before bootstrapping it.") : ok(bindings);
};

/** Host discovery must match the adapter's bare-skill convention as well as its namespaced dependencies. */
export const expectedDependencySkills = (bindings: readonly BindingFacts[]): readonly string[] => [...new Set(bindings.flatMap(({ adapter }) =>
  dependencyRefs(adapter).map(({ plugin, skill }) => adapter.bareSkillPlugins.includes(plugin) ? skill : `${plugin}:${skill}`)))];
const dependencyRefs = (adapter: BindingFacts["adapter"]) => [...Object.values(adapter.fulfil).flat(), ...adapter.catalog,
  ...adapter.knowledgeStores.map(({ plugin, setup }) => ({ plugin, skill: setup }))];

/** Validate the content the host actually discovered, including cache copies and bare skills. */
export const activeSkillsMatch = (project: string, input: BootstrapInput, discovered: readonly {readonly name: string; readonly path: string}[]): boolean => {
  const bindings = stagedBindings(project, input);
  return bindings.ok && bindings.value.every(({ adapter }) => dependencyRefs(adapter).every(({ plugin, skill }) => {
    const name = adapter.bareSkillPlugins.includes(plugin) ? skill : `${plugin}:${skill}`;
    const matches = discovered.filter((entry) => entry.name === name);
    const source = readContentTree(join(pluginTarget(project, plugin), "source/skills", skill));
    return source.ok && matches.length > 0 && matches.every((entry) => {
      const active = readContentTree(dirname(entry.path));
      return active.ok && active.value === source.value;
    });
  }));
};

/** Fetch and verify missing pinned sources, then stage complete unmodified trees; host-only manifests live in a separate wrapper. */
export const stageDependencies = (project: string, input: BootstrapInput, fetcher: SourceFetcher = GIT_FETCHER): Promise<Result<string>> =>
  fetchDependencies(project, input, fetcher).then((fetched) => fetched.ok ? stageResolved(project, resolvedInput(project, input)) : fetched);
const stageResolved = (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const bindings = pluginBindings(project, input);
  const roots = parseRootArgs(project, input.pluginRoots);
  return !bindings.ok ? Promise.resolve(bindings) : !roots.ok ? Promise.resolve(setupFailure(roots.message))
    : sequence(pluginNames(input), (name) => stageNamed(project, roots.roots, name), "Pinned dependencies staged.");
};

/** Installed wrappers are checked against the same binding gate, rather than trusting a marker alone. */
export const stagedBindings = (project: string, input: BootstrapInput): Result<readonly BindingFacts[]> => pluginBindings(project, {
  ...input, pluginRoots: pluginNames(input).map((name) => `${name}@${pinnedVersion(name)}=${join(pluginTarget(project, name), "source")}`),
});
const stageNamed = (project: string, roots: readonly PluginRootArg[], name: string): Promise<Result<string>> => {
  const root = roots.find((root) => rootPluginName(NODE_PLUGIN_FACTS_IO, root) === name);
  return root === undefined ? Promise.resolve(setupFailure(`No source for ${name}.`)) : stageDependency(project, name, root.path);
};
export const stageDependency = async (project: string, name: string, source: string): Promise<Result<string>> => {
  const target = pluginTarget(project, name);
  const marker = await readText(join(target, "upf-source.json"));
  const manifest = JSON.stringify({ source: resolve(source), version: pinnedVersion(name) }, null, 2);
  return !marker.ok ? marker : marker.value !== null ? marker.value === manifest || markerMatches(marker.value, source) ? ok(target)
    : setupFailure(`An existing ${name} wrapper has different source settings. Preserve it and reconcile its recorded source.`)
    : directory(project, dirname(target)).then((dir) => dir.ok ? copySource(project, target, source, name, manifest) : dir);
};
const markerMatches = (raw: string, source: string): boolean => {
  try { const marker: unknown = JSON.parse(raw); return object(marker) && marker.source === resolve(source); }
  catch { return false; }
};
const copySource = async (project: string, target: string, source: string, name: string, marker: string): Promise<Result<string>> => {
  const staged = join(toolsRoot(project), "staging", randomUUID());
  const sourceTree = join(staged, "source");
  const manifest = await readText(join(target, ".codex-plugin/plugin.json"));
  const safe = await safePath(project, target);
  return !manifest.ok ? manifest : !safe || manifest.value !== null ? setupFailure(`Unmanaged or unsafe ${name} wrapper already exists.`)
    : directory(project, staged).then((created) => created.ok ? cp(source, sourceTree, { recursive: true, dereference: false, errorOnExist: true, force: false, filter: (path) => ![".git", "node_modules", ".venv", "__pycache__"].some((part) => path.split(/[\\/]/).includes(part)) })
      .then(() => writeText(project, join(staged, ".codex-plugin/plugin.json"), JSON.stringify({ name,
        version: pinnedVersion(name), skills: "./source/skills/" }, null, 2), null))
      .then((written) => written.ok ? writeText(project, join(staged, "upf-source.json"), marker, null) : written)
      .then((written) => written.ok ? rename(staged, target).then(() => ok(target)) : written) : created)
      .catch(() => setupFailure(`Could not stage ${name}; preserve existing source and wrapper, then inspect the partial installation.`));
};
const pinnedVersion = (name: string): string => {
  const raw = NODE_PLUGIN_FACTS_IO.readJson(join(FRAMEWORK_PLUGIN, LOCK_FILE));
  const lock = raw.kind === "value" ? parseLock(raw.value) : undefined;
  return lock?.ok ? lock.lock.plugins.find((pin) => pin.plugin === name)?.version ?? "0.0.0" : "0.0.0";
};

export const registerHost = async (project: string, input: BootstrapInput, knowledgeCommand?: string): Promise<Result<string>> => {
  const path = join(project, ".codex/config.toml");
  const [old, parsed] = await Promise.all([readText(path), readToml(input.python, path, project)]);
  const registration = parsed.ok ? codexToolingRegistration(parsed.value, { project, marketplace: marketplaceRoot(project),
    ...(knowledgeCommand === undefined ? {} : { knowledgeCommand }) }) : undefined;
  return !old.ok ? old : !parsed.ok ? parsed : registration?.ok !== true ? setupFailure(registration?.diagnostics.map((d) => d.message).join(" ") ?? "Host registration unavailable.")
    : registration.value === "" ? ok(path) : writeText(project, path, `${old.value ?? ""}\n${registration.value}\n`, old.value);
};

export const installHostPlugins = async (project: string, input: BootstrapInput, names: readonly string[]): Promise<Result<string>> => {
  const catalog = join(marketplaceRoot(project), ".agents/plugins/marketplace.json");
  const [old, parsed] = await Promise.all([readText(catalog), nodeProjectFiles.read(catalog)()]);
  const merged = parsed.ok ? mergeCodexMarketplace(parsed.value, ["unified-plugin-framework", "project-knowledge", ...pluginNames(input)]) : undefined;
  return !old.ok ? old : !parsed.ok ? parsed : merged?.ok !== true ? setupFailure(merged?.diagnostics.map((d) => d.message).join(" ") ?? "The marketplace could not be read.")
    : writeText(project, catalog, JSON.stringify(merged.value, null, 2), old.value).then((written) => written.ok ? registerHost(project, input) : written)
    .then((registered) => registered.ok ? sequence(names.filter((name) => !barePlugins(project, input).includes(name)),
      (name) => command("codex", CODEX_TOOLING.install(name), project), "Host plugins activated.") : registered)
    .then((installed) => installed.ok ? activateBare(project, input, names) : installed);
};
const barePlugins = (project: string, input: BootstrapInput): readonly string[] => {
  const bindings = pluginBindings(project, input);
  return bindings.ok ? [...new Set(bindings.value.flatMap(({ adapter }) => adapter.bareSkillPlugins))] : [];
};
const activateBare = (project: string, input: BootstrapInput, names: readonly string[]): Promise<Result<string>> => {
  const bindings = pluginBindings(project, input);
  const skills = bindings.ok ? bindings.value.flatMap(({ adapter }) => [...Object.values(adapter.fulfil).flat(), ...adapter.catalog]
    .filter(({ plugin }) => names.includes(plugin) && adapter.bareSkillPlugins.includes(plugin))) : [];
  return sequence([...new Map(skills.map((ref) => [`${ref.plugin}/${ref.skill}`, ref])).values()],
    (ref) => copyBare(project, ref.plugin, ref.skill), "Bare dependency skills activated.");
};
const copyBare = async (project: string, plugin: string, skill: string): Promise<Result<string>> => {
  const source = join(pluginTarget(project, plugin), "source/skills", skill);
  const target = join(project, ".agents/skills", skill);
  const expected = `${plugin}/${skill}@${pinnedVersion(plugin)}`;
  const marker = await readText(join(target, ".upf-source"));
  const sourceDigest = readContentTree(source);
  const activeDigest = readContentTree(target);
  return !marker.ok ? marker : marker.value === expected ? sourceDigest.ok && activeDigest.ok && sourceDigest.value === activeDigest.value ? ok(target)
    : setupFailure(`Active bare skill ${skill} differs from its pinned source. Preserve the edited copy and reconcile it explicitly.`)
    : marker.value !== null ? setupFailure(`Existing ${skill} has different ownership.`)
    : readText(join(target, "SKILL.md")).then((existing) => !existing.ok ? existing : existing.value !== null ? setupFailure(`Existing ${skill} is unmanaged; preserve it.`)
      : directory(project, target).then((created) => created.ok ? readdir(target).then((entries) => entries.length === 0
        ? cp(source, target, { recursive: true, errorOnExist: false, force: false })
        : Promise.reject(new Error("unmanaged-content")))
        .then(() => writeText(project, join(target, ".upf-source"), expected, null)).catch(() => setupFailure(`Bare skill ${skill} could not be installed; inspect its partial directory before resuming.`)) : created));
};

export const discoverHost = (project: string): Promise<Result<readonly {readonly name: string; readonly path: string}[]>> =>
  hostRequest(project, CODEX_TOOLING.discovery(project)).then((reply) => !reply.ok ? reply : hostSkills(reply.value));
const hostSkills = (reply: unknown): Result<readonly { readonly name: string; readonly path: string }[]> => {
  const result = object(reply) && object(reply.result) ? reply.result : {};
  const entries = Array.isArray(result.data) ? result.data : [];
  const errors = entries.flatMap((entry: unknown) => object(entry) && Array.isArray(entry.errors) ? entry.errors : []);
  return errors.length > 0 ? fail("host-skill-errors", "The host reported skill discovery errors.", "Correct the reported skill installation through its supported installer; then repeat discovery.")
    : ok(entries.flatMap((entry: unknown) => object(entry) && Array.isArray(entry.skills) ? entry.skills : [])
      .filter((skill: unknown): skill is {readonly name: string; readonly path: string} => object(skill) && typeof skill.name === "string" && typeof skill.path === "string"));
};

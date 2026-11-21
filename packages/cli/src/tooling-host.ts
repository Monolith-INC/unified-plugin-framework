import { realpathSync } from "node:fs";
import { cp, lstat, readdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, object, ok, type Result } from "@agent-plugins/project";
import { adapterPlugins, findWorkflow, LOCK_FILE, parseLock, pinMatches, type BindingFacts } from "@agent-plugins/workflows";
import { rootArg, rootPluginName, selectedPlugins, sourcesFor, verifySource, type DependencySource, type SourceFetcher } from "./dependency-sources.js";
import { fetchSources, GIT_FETCHER, unfetched, type FetchContext } from "./dependency-fetch.js";
import { bundledRoots } from "./distribution.js";
import type { BootstrapInput } from "./tooling-input.js";
import { gatherBinding, parseRootArgs, type PluginRootArg } from "./plugin-facts.js";
import { NODE_PLUGIN_FACTS_IO, readContentTree, skillNames } from "./plugin-reader.js";
import { checkPluginBinding } from "@agent-plugins/workflows";
import { sequence } from "./tooling-process.js";
import { HOSTS, type DiscoveredSkill, type HostContext, type HostEnvironment, type HostPlugin } from "./host-table.js";
import type { HostName } from "./host-names.js";
import { directory, readText, safePath, setupFailure, withSetupStage, writeText } from "./tooling-files.js";

export const FRAMEWORK_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const toolsRoot = (project: string): string => join(project, ".upf-tools");
export const pluginTarget = (project: string, name: string): string => join(toolsRoot(project), "plugins", name);
export const pluginNames = (input: BootstrapInput): readonly string[] => selectedPlugins(input.workflows);
const FRAMEWORK_PLUGIN = FRAMEWORK_ROOT;
/** Source directory of a framework-shipped plugin (`unified-plugin-framework` lives at repo root `.`). */
export const frameworkPluginRoot = (name: string): string =>
  name === "unified-plugin-framework" ? FRAMEWORK_ROOT : join(FRAMEWORK_ROOT, "plugins", name);
/** Verified checkouts of fetched dependency sources, one per plugin and pinned version. */
export const sourcesRoot = (project: string): string => join(toolsRoot(project), "sources");

/** Selected plugins without an explicit root, each with its declared source at the pinned version. */
export const dependencySources = (project: string, input: BootstrapInput): Result<readonly DependencySource[]> => {
  const roots = parseRootArgs(project, input.pluginRoots);
  return roots.ok ? sourcesFor(NODE_PLUGIN_FACTS_IO, FRAMEWORK_PLUGIN, input.workflows, roots.roots) : setupFailure(roots.message);
};
/** Explicit roots as given, plus the cached checkout for every plugin bootstrap fetches; both pass one binding gate.
 * A plan that cannot be made leaves the input as given: the dependencies step reports why. */
const includedRoots = (project: string, input: BootstrapInput, mode: "verify" | "resolve" = "verify"): Result<readonly PluginRootArg[]> | null => {
  const sources = dependencySources(project, input);
  return sources.ok ? bundledRoots(FRAMEWORK_ROOT, sources.value, mode) : sources;
};
export const resolvedInput = (project: string, input: BootstrapInput): BootstrapInput => {
  const included = includedRoots(project, input, "resolve");
  const sources = dependencySources(project, input);
  return included !== null ? included.ok ? { ...input, pluginRoots: [...input.pluginRoots,
    ...included.value.map(({ name, version, path }) => `${name}@${version}=${path}`)] } : input
    : sources.ok ? { ...input, pluginRoots: [...input.pluginRoots, ...sources.value.map((source) => rootArg(sourcesRoot(project), source))] } : input;
};
/** Installed distributions verify local content and never enter the development fetch path. */
export const pendingSources = (project: string, input: BootstrapInput): Promise<Result<readonly DependencySource[]>> => {
  const included = includedRoots(project, input);
  const sources = dependencySources(project, input);
  return included !== null ? Promise.resolve(included.ok ? ok([]) : included)
    : sources.ok ? unfetched(fetchContext(project, input, GIT_FETCHER), sources.value).then(ok) : Promise.resolve(sources);
};
const fetchContext = (project: string, input: BootstrapInput, fetcher: SourceFetcher): FetchContext => ({ project, cache: sourcesRoot(project),
  verify: verifySource(NODE_PLUGIN_FACTS_IO, FRAMEWORK_PLUGIN, input.workflows), fetcher });
const fetchDependencies = (project: string, input: BootstrapInput, fetcher: SourceFetcher): Promise<Result<string>> => {
  const included = includedRoots(project, input);
  const sources = dependencySources(project, input);
  return included !== null ? Promise.resolve(included.ok ? ok("Bundled dependency sources verified.") : included)
    : sources.ok ? fetchSources(fetchContext(project, input, fetcher), sources.value) : Promise.resolve(sources);
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
export const activeSkillsMatch = (project: string, input: BootstrapInput, discovered: readonly DiscoveredSkill[]): boolean => {
  const bindings = stagedBindings(project, input);
  return bindings.ok && bindings.value.every(({ adapter }) => dependencyRefs(adapter).every(({ plugin, skill }) =>
    activeMatches(discovered, adapter.bareSkillPlugins.includes(plugin) ? skill : `${plugin}:${skill}`, join(pluginTarget(project, plugin), "source/skills", skill))));
};
const activeMatches = (discovered: readonly DiscoveredSkill[], name: string, sourceDir: string): boolean => {
  const matches = discovered.filter((entry) => entry.name === name);
  const source = readContentTree(sourceDir);
  return source.ok && matches.length > 0 && matches.every((entry) => {
    const active = readContentTree(dirname(entry.path));
    return active.ok && active.value === source.value;
  });
};

/** Plugins this framework ships itself, rather than pinned dependencies. */
export const FRAMEWORK_PLUGINS: readonly string[] = Object.freeze(["unified-plugin-framework"]);
/** Every skill the installed framework plugins provide, under the name the host discovers it by. */
export const frameworkSkills = (project: string, host: HostName): readonly { readonly name: string; readonly source: string }[] =>
  FRAMEWORK_PLUGINS.flatMap((plugin) => skillNames(join(frameworkTarget(project, host, plugin), "skills"))
    .map((skill) => ({ name: `${plugin}:${skill}`, source: join(frameworkTarget(project, host, plugin), "skills", skill) })));
/** The host serves its own cached copy, current only once activation succeeds; an earlier install's copy can share every name, so compare bytes. */
export const frameworkSkillsMatch = (project: string, discovered: readonly DiscoveredSkill[], host: HostName): boolean =>
  frameworkSkills(project, host).every(({ name, source }) => activeMatches(discovered, name, source));

/** Fetch and verify missing pinned sources, then stage complete unmodified trees; host-only manifests live in a separate wrapper. */
export const stageDependencies = (project: string, input: BootstrapInput, fetcher: SourceFetcher = GIT_FETCHER): Promise<Result<string>> =>
  fetchDependencies(project, input, fetcher).then((fetched) => fetched.ok ? stageResolved(project, resolvedInput(project, input)) : fetched);
const stageResolved = (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const bindings = pluginBindings(project, input);
  const roots = parseRootArgs(project, input.pluginRoots);
  return !bindings.ok ? Promise.resolve(bindings) : !roots.ok ? Promise.resolve(setupFailure(roots.message))
    : sequence(pluginNames(input), (name) => stageNamed(project, roots.roots, name, input.python), "Pinned dependencies staged.").then((staged) => {
      const checked = staged.ok ? stagedBindings(project, input) : staged;
      return checked.ok ? staged : checked;
    });
};

/** Installed wrappers are checked against the same binding gate, rather than trusting a marker alone. */
export const stagedBindings = (project: string, input: BootstrapInput): Result<readonly BindingFacts[]> => pluginBindings(project, {
  ...input, pluginRoots: pluginNames(input).map((name) => `${name}@${pinnedVersion(name)}=${join(pluginTarget(project, name), "source")}`),
});
const stageNamed = (project: string, roots: readonly PluginRootArg[], name: string, python: string): Promise<Result<string>> => {
  const root = roots.find((root) => rootPluginName(NODE_PLUGIN_FACTS_IO, root) === name);
  return root === undefined ? Promise.resolve(setupFailure(`No source for ${name}.`)) : stageDependency(project, name, root.path, python);
};
export const stageDependency = async (project: string, name: string, source: string, python = "python3"): Promise<Result<string>> => {
  const target = pluginTarget(project, name);
  const marker = await readText(join(target, "upf-source.json"));
  const manifest = JSON.stringify({ source: resolve(source), version: pinnedVersion(name) }, null, 2);
  return !marker.ok ? marker : marker.value !== null ? marker.value === manifest || markerMatches(marker.value, source) ? ok(target)
    : identicalSource(target, source) ? writeText(project, join(target, "upf-source.json"), manifest, marker.value, python).then((saved) => saved.ok ? ok(target) : saved)
      : fail("modified-file", `An existing ${name} wrapper has different source settings.`, "Preserve it and reconcile its recorded source.")
    : directory(project, dirname(target)).then((dir) => dir.ok ? copySource(project, target, source, name, manifest, python) : dir);
};
const identicalSource = (target: string, source: string): boolean => {
  const staged = readContentTree(join(target, "source"));
  const expected = readContentTree(source);
  return staged.ok && expected.ok && staged.value === expected.value;
};
const markerMatches = (raw: string, source: string): boolean => {
  try { const marker: unknown = JSON.parse(raw); return object(marker) && marker.source === resolve(source); }
  catch { return false; }
};
const copySource = async (project: string, target: string, source: string, name: string, marker: string, python: string): Promise<Result<string>> => {
  const occupied = await lstat(target).then(() => true).catch((error: unknown) =>
    !object(error) || error.code !== "ENOENT");
  const safe = await safePath(project, target);
  return !safe ? fail("symlink-escape", `The ${name} wrapper follows a linked path.`, "Preserve the link and reconcile the installation location.")
    : occupied ? fail("unmanaged-file", `An unmanaged ${name} wrapper already exists.`, "Preserve existing files and reconcile ownership before rerunning.")
    : withSetupStage(project, python, (staged) =>
      cp(source, join(staged, "source"), { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false, filter: (path) => ![".git", "node_modules", ".venv", "__pycache__"].some((part) => path.split(/[\\/]/).includes(part)) })
      .then(() => writeText(project, join(staged, "upf-source.json"), marker, null, python))
      .then((written) => written.ok ? rename(staged, target).then(() => ok(target)) : written))
      .catch(() => fail("partial-step", `Could not stage ${name}.`, "Preserve the existing source and wrapper, then rerun staging."));
};
const pinnedVersion = (name: string): string => {
  const raw = NODE_PLUGIN_FACTS_IO.readJson(join(FRAMEWORK_PLUGIN, LOCK_FILE));
  const lock = raw.kind === "value" ? parseLock(raw.value) : undefined;
  return lock?.ok ? lock.lock.plugins.find((pin) => pin.plugin === name)?.version ?? "0.0.0" : "0.0.0";
};

/** The selected host's view of this project's setup; hosts record installs under the real path, so resolve it once here. */
const hostContext = (project: string, input: BootstrapInput, environment: HostEnvironment, knowledgeCommand?: string): HostContext => ({ project,
  canonical: realProject(project), claudeState: environment.claudeState, tools: toolsRoot(project), python: input.python,
  ...(environment.hostCli?.kind === "available" ? { program: environment.hostCli.program } : {}),
  ...(knowledgeCommand === undefined ? {} : { knowledgeCommand }), ...(environment.patience === undefined ? {} : { patience: environment.patience }) });
const realProject = (project: string): string => {
  try { return realpathSync(project); } catch { return resolve(project); } // A project that cannot be resolved yet is named as given.
};
/** Framework payloads are built per host, so each host has its own copy; dependency sources are shared and wrapped per host. */
export const frameworkTarget = (project: string, host: HostName, name: string): string => join(toolsRoot(project), HOSTS[host].frameworkDir, name);
const hostPlugins = (project: string, input: BootstrapInput, names: readonly string[]): readonly HostPlugin[] => names.map((name) =>
  FRAMEWORK_PLUGINS.includes(name) ? { name, root: frameworkTarget(project, input.host, name), kind: "framework" } : { name, root: pluginTarget(project, name), kind: "dependency" });
const wrapperManifest = (name: string): string => JSON.stringify({ name, version: pinnedVersion(name), skills: "./source/skills/" }, null, 2);
/** A staged dependency gets the selected host's manifest beside its unmodified source; a different existing manifest is preserved. */
const wrapped = (project: string, input: BootstrapInput, plugin: HostPlugin): Promise<Result<string>> => {
  switch (plugin.kind) {
    case "framework": return Promise.resolve(ok(plugin.root));
    case "dependency": return ensureWrapper(project, join(plugin.root, HOSTS[input.host].manifest), plugin.name, input.python);
  }
};
const ensureWrapper = (project: string, path: string, name: string, python: string): Promise<Result<string>> => {
  const expected = wrapperManifest(name);
  return readText(path).then((existing) => !existing.ok ? existing
    : existing.value === null ? writeText(project, path, expected, null, python)
      : existing.value === expected ? ok(path) : fail("modified-file", `An existing ${name} host manifest differs from its pinned wrapper.`, "Preserve it and reconcile the wrapper before rerunning."));
};

export const registerHost = (project: string, input: BootstrapInput, environment: HostEnvironment, knowledgeCommand?: string): Promise<Result<string>> =>
  HOSTS[input.host].register(hostContext(project, input, environment, knowledgeCommand));
export const hostRegistered = (project: string, input: BootstrapInput, environment: HostEnvironment, knowledgeCommand?: string): Promise<Result<boolean>> =>
  HOSTS[input.host].registered(hostContext(project, input, environment, knowledgeCommand));

export const installHostPlugins = (project: string, input: BootstrapInput, environment: HostEnvironment, names: readonly string[]): Promise<Result<string>> => {
  const host = HOSTS[input.host];
  const context = hostContext(project, input, environment);
  const bare = barePlugins(project, input);
  return host.catalog(context, hostPlugins(project, input, [...FRAMEWORK_PLUGINS, ...pluginNames(input)].filter((name) => !bare.includes(name))))
    .then((listed) => listed.ok ? host.register(context) : listed)
    .then((registered) => registered.ok ? sequence(hostPlugins(project, input, names.filter((name) => !bare.includes(name))),
      (plugin) => wrapped(project, input, plugin).then((manifest) => manifest.ok ? host.activate(context, plugin) : manifest), "Host plugins activated.") : registered)
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
    (ref) => copyBare(project, HOSTS[input.host].bareSkills, ref.plugin, ref.skill, input.python), "Bare dependency skills activated.");
};
const copyBare = async (project: string, folder: string, plugin: string, skill: string, python: string): Promise<Result<string>> => {
  const source = join(pluginTarget(project, plugin), "source/skills", skill);
  const target = join(project, folder, skill);
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
        .then(() => writeText(project, join(target, ".upf-source"), expected, null, python)).catch(() => setupFailure(`Bare skill ${skill} could not be installed; inspect its partial directory before resuming.`)) : created));
};

export const discoverHost = (project: string, input: BootstrapInput, environment: HostEnvironment): Promise<Result<readonly DiscoveredSkill[]>> =>
  HOSTS[input.host].discover(hostContext(project, input, environment));

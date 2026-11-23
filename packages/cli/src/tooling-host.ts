import { realpathSync } from "node:fs";
import { cp, lstat, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@agent-plugins/compiler";
import { fail, object, ok, type Result } from "@agent-plugins/project";
import { adapterPlugins, checkPluginBinding, findWorkflow, LOCK_FILE, parseLock, pinMatches, projectSkillName, WORKFLOWS, type BindingFacts, type PluginSkillRef } from "@agent-plugins/workflows";
import { rootArg, rootPluginName, selectedPlugins, sourcesFor, verifySource, type DependencySource, type SourceFetcher } from "./dependency-sources.js";
import { fetchSources, GIT_FETCHER, unfetched, type FetchContext } from "./dependency-fetch.js";
import { bundledRoots } from "./distribution.js";
import type { BootstrapInput } from "./tooling-input.js";
import { gatherBinding, parseRootArgs, type PluginRootArg } from "./plugin-facts.js";
import { NODE_PLUGIN_FACTS_IO, readContentTree } from "./plugin-reader.js";
import { command, scaled, sequence } from "./tooling-process.js";
import { HOSTS, type DiscoveredSkill, type HostContext, type HostEnvironment } from "./host-table.js";
import type { HostName } from "./host-names.js";
import { rewriteSkillFrontmatterName } from "./host-specs.js";
import { resolveSourceBundle } from "./bundle-source.js";
import { directory, readText, safePath, setupFailure, withSetupStage, writeText } from "./tooling-files.js";

export const FRAMEWORK_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const toolsRoot = (project: string): string => join(project, ".upf-tools");
export const pluginTarget = (project: string, name: string): string => join(toolsRoot(project), "plugins", name);
export const pluginNames = (input: BootstrapInput): readonly string[] => selectedPlugins(input.workflows);
const FRAMEWORK_PLUGIN = FRAMEWORK_ROOT;

/** All workflow contract operation names owned by `unified-plugin-framework`. */
export const FRAMEWORK_CONTRACT_OPERATIONS: ReadonlySet<string> = new Set(
  Object.values(WORKFLOWS).flatMap((adapter) => Object.keys(adapter.fulfil)),
);

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

export interface MaterializedSkillSpec {
  readonly plugin: string;
  readonly sourceSkill: string;
  readonly targetName: string;
}

const dependencyRefs = (adapter: BindingFacts["adapter"]): readonly PluginSkillRef[] => [
  ...Object.values(adapter.fulfil).flat(),
  ...adapter.catalog,
  ...(adapter.supportSkills ?? []),
  ...adapter.knowledgeStores.map(({ plugin, setup }) => ({ plugin, skill: setup })),
];

/** Unique dependency skills to materialize for the selected workflow bindings, with collision-free target names. */
export const dependencyMaterializations = (bindings: readonly BindingFacts[]): readonly MaterializedSkillSpec[] => {
  const specs = bindings.flatMap(({ adapter }) =>
    dependencyRefs(adapter).map((ref): MaterializedSkillSpec => ({
      plugin: ref.plugin,
      sourceSkill: ref.skill,
      targetName: projectSkillName(ref, FRAMEWORK_CONTRACT_OPERATIONS),
    })),
  );
  return [...new Map(specs.map((spec) => [spec.targetName, spec])).values()];
};

/** Every expected dependency skill name as materialized into the host's project-local skills directory. */
export const expectedDependencySkills = (bindings: readonly BindingFacts[]): readonly string[] =>
  dependencyMaterializations(bindings).map(({ targetName }) => targetName);

export interface DriftedSkill {
  readonly name: string;
  readonly paths: readonly string[];
}

/** Prefer repo-scoped skills when a host also lists global copies. */
export const selectActiveMatches = (
  discovered: readonly DiscoveredSkill[],
  name: string,
  _plugin: string,
  _bare: boolean,
): readonly DiscoveredSkill[] => {
  const matches = discovered.filter((entry) => entry.name === name);
  const repo = matches.filter((entry) => entry.scope === "repo");
  return repo.length > 0 ? repo : matches;
};

const expectedSourceOverrides = async (
  sourceDir: string,
  sourceSkill: string,
  targetName: string,
): Promise<ReadonlyMap<string, string> | undefined> => {
  if (sourceSkill === targetName) return undefined;
  const read = await readText(join(sourceDir, "SKILL.md"));
  return read.ok && read.value !== null
    ? new Map([["SKILL.md", rewriteSkillFrontmatterName(read.value, targetName)]])
    : undefined;
};

export const skillDrift = (
  discovered: readonly DiscoveredSkill[],
  name: string,
  plugin: string,
  bare: boolean,
  sourceDir: string,
  overrides?: ReadonlyMap<string, string>,
): DriftedSkill | undefined => {
  const matches = selectActiveMatches(discovered, name, plugin, bare);
  const source = readContentTree(sourceDir, overrides);
  const mismatched = !source.ok
    ? matches.map(({ path }) => path)
    : matches.filter((entry) => {
        const active = readContentTree(dirname(entry.path));
        return !active.ok || active.value !== source.value;
      }).map(({ path }) => path);
  return matches.length === 0 ? { name, paths: [] } : mismatched.length > 0 ? { name, paths: mismatched } : undefined;
};

/** Report every expected dependency skill whose materialized copy differs from its pinned staged source. */
export const driftedSkills = async (project: string, input: BootstrapInput, discovered: readonly DiscoveredSkill[]): Promise<readonly DriftedSkill[]> => {
  const bindings = stagedBindings(project, input);
  if (!bindings.ok) return [];
  const specs = dependencyMaterializations(bindings.value);
  const checked = await Promise.all(specs.map(async ({ plugin, sourceSkill, targetName }) => {
    const sourceDir = join(pluginTarget(project, plugin), "source/skills", sourceSkill);
    const overrides = await expectedSourceOverrides(sourceDir, sourceSkill, targetName);
    return skillDrift(discovered, targetName, plugin, true, sourceDir, overrides);
  }));
  return checked.filter((entry): entry is DriftedSkill => entry !== undefined);
};

/** Validate materialized dependency skills against their pinned staged sources. */
export const activeSkillsMatch = async (project: string, input: BootstrapInput, discovered: readonly DiscoveredSkill[]): Promise<boolean> =>
  stagedBindings(project, input).ok && (await driftedSkills(project, input, discovered)).length === 0;

/** Plugins this framework ships itself, rather than pinned dependencies. */
export const FRAMEWORK_PLUGINS: readonly string[] = Object.freeze(["unified-plugin-framework"]);

export interface FrameworkSkillRecord {
  readonly name: string;
  readonly plugin: string;
  readonly source: string;
  readonly sha256: string;
}

/** Every framework skill expected in the host's project-local skills directory, paired with its compiled bundle digest. */
export const frameworkSkills = (project: string, host: HostName): readonly FrameworkSkillRecord[] =>
  FRAMEWORK_PLUGINS.flatMap((plugin) => {
    const compiled = resolveSourceBundle(frameworkPluginRoot(plugin), host);
    if (!compiled.ok) return [];
    const skillsDir = join(project, HOSTS[host].bareSkills);
    return compiled.value.bundle.files
      .filter((file) => /^skills\/[^/]+\/SKILL\.md$/u.test(file.path))
      .map((file) => {
        const name = file.path.split("/")[1] ?? "";
        return { name, plugin, source: join(skillsDir, name), sha256: sha256(file.content) };
      });
  });

/** Verify every compiled framework skill exists in `discovered` and matches the compiled bundle byte-for-byte. */
export const frameworkSkillsMatch = async (project: string, discovered: readonly DiscoveredSkill[], host: HostName): Promise<boolean> => {
  const expected = frameworkSkills(project, host);
  if (expected.length === 0) return false;
  const checks = await Promise.all(expected.map(async ({ name, sha256: expectedDigest }) => {
    const matches = selectActiveMatches(discovered, name, "unified-plugin-framework", true);
    if (matches.length === 0) return false;
    const files = await Promise.all(matches.map(async ({ path }) => {
      const text = await readText(path);
      return text.ok && text.value !== null && sha256(Buffer.from(text.value, "utf8")) === expectedDigest;
    }));
    return files.every(Boolean);
  }));
  return checks.every(Boolean);
};

/** Fetch and verify missing pinned sources, then stage complete unmodified trees under `.upf-tools/plugins/<name>/source`. */
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

/** Installed sources are checked against the same binding gate, rather than trusting a marker alone. */
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

/** The selected host's view of this project's setup. */
const hostContext = (project: string, input: BootstrapInput, environment: HostEnvironment, knowledgeCommand?: string): HostContext => ({ project,
  canonical: realProject(project), claudeState: environment.claudeState, tools: toolsRoot(project), python: input.python, codexQuestions: input.consent.codexQuestions,
  ...(environment.hostCli?.kind === "available" ? { program: environment.hostCli.program } : {}),
  ...(knowledgeCommand === undefined ? {} : { knowledgeCommand }), ...(environment.patience === undefined ? {} : { patience: environment.patience }) });
const realProject = (project: string): string => {
  try { return realpathSync(project); } catch { return resolve(project); }
};

/** Legacy host payload path helper retained for compatibility. */
export const frameworkTarget = (project: string, host: HostName, name: string): string => join(toolsRoot(project), HOSTS[host].frameworkDir, name);

export const registerHost = (project: string, input: BootstrapInput, environment: HostEnvironment, knowledgeCommand?: string): Promise<Result<string>> =>
  HOSTS[input.host].register(hostContext(project, input, environment, knowledgeCommand));
export const hostRegistered = (project: string, input: BootstrapInput, environment: HostEnvironment, knowledgeCommand?: string): Promise<Result<boolean>> =>
  HOSTS[input.host].registered(hostContext(project, input, environment, knowledgeCommand));

/**
 * Deterministic, zero-CLI host plugin activation: records the pinned host spec receipt, materializes all required
 * dependency skills into the host's project-local skills directory (`.agents/skills` or `.claude/skills`), and
 * initializes required project runtimes (`_bmad/`).
 */
export const installHostPlugins = (project: string, input: BootstrapInput, environment: HostEnvironment, names: readonly string[]): Promise<Result<string>> => {
  const host = HOSTS[input.host];
  const context = hostContext(project, input, environment);
  return host.register(context)
    .then((registered) => registered.ok ? materializeDependencies(project, input, names) : registered)
    .then((activated) => activated.ok ? ensureBmadRuntime(project, input, environment, names) : activated);
};

const BMAD_PLUGIN = "bmad-method";
const BMAD_RUNTIME_FILES: readonly string[] = Object.freeze([
  "_bmad/scripts/resolve_customization.py",
  "_bmad/scripts/resolve_config.py",
  "_bmad/config.toml",
]);
const bmadSetupScript = (project: string): string => join(pluginTarget(project, BMAD_PLUGIN), "source/skills/bmad/scripts/setup.py");
const hasStagedBmadSetup = (project: string, input: BootstrapInput): Promise<boolean> =>
  !pluginNames(input).includes(BMAD_PLUGIN)
    ? Promise.resolve(false)
    : readText(bmadSetupScript(project)).then((read) => read.ok && read.value !== null);

/** BMad skills require the project `_bmad/` runtime scripts and config created by the staged `bmad` setup script. */
export const bmadRuntimeReady = async (project: string, input: BootstrapInput): Promise<boolean> => {
  if (!await hasStagedBmadSetup(project, input)) return true;
  const checks = await Promise.all(BMAD_RUNTIME_FILES.map(async (rel) => {
    const file = join(project, rel);
    return await safePath(project, file) && await readText(file).then((read) => read.ok && read.value !== null);
  }));
  return checks.every(Boolean);
};

const ensureBmadRuntime = async (
  project: string,
  input: BootstrapInput,
  environment: HostEnvironment,
  names: readonly string[],
): Promise<Result<string>> => {
  if (!names.includes(BMAD_PLUGIN) || !await hasStagedBmadSetup(project, input)) return ok("BMad runtime not required.");
  if (!await safePath(project, join(project, "_bmad"))) {
    return fail("symlink-escape", "The _bmad runtime directory follows a linked path.", "Preserve the link and reconcile the project runtime location.");
  }
  const bareDir = join(project, HOSTS[input.host].bareSkills);
  const activeBmad = join(bareDir, "bmad");
  const activeExists = await readText(join(activeBmad, "scripts/setup.py")).then((read) => read.ok && read.value !== null);
  const skillDir = activeExists ? activeBmad : join(pluginTarget(project, BMAD_PLUGIN), "source/skills/bmad");
  const script = join(skillDir, "scripts/setup.py");
  return command(input.python, [script, "--project-root", project, "--skill", skillDir, "--root", bareDir], project, scaled(60_000, environment.patience));
};

const materializeDependencies = (project: string, input: BootstrapInput, names: readonly string[]): Promise<Result<string>> => {
  const bindings = stagedBindings(project, input);
  const fallback = bindings.ok ? bindings : pluginBindings(project, input);
  const specs = fallback.ok ? dependencyMaterializations(fallback.value).filter(({ plugin }) => names.includes(plugin)) : [];
  return sequence(specs, (spec) => materializeSkill(project, HOSTS[input.host].bareSkills, spec), "Dependency skills materialized.");
};

const materializeSkill = async (project: string, folder: string, spec: MaterializedSkillSpec): Promise<Result<string>> => {
  const source = join(pluginTarget(project, spec.plugin), "source/skills", spec.sourceSkill);
  const target = join(project, folder, spec.targetName);
  if (!await safePath(project, target)) {
    return fail("symlink-escape", `Skill directory ${spec.targetName} follows a linked path.`, "Preserve the link and reconcile the active skill directory.");
  }
  const ownerPrefix = `${spec.plugin}/${spec.sourceSkill}@`;
  const expected = `${ownerPrefix}${pinnedVersion(spec.plugin)}`;
  const overrides = await expectedSourceOverrides(source, spec.sourceSkill, spec.targetName);
  const sourceDigest = readContentTree(source, overrides);
  if (!sourceDigest.ok) return setupFailure(`Staged source for ${spec.plugin}/${spec.sourceSkill} is unreadable.`);
  const marker = await readText(join(target, ".upf-source"));
  if (!marker.ok) return marker;
  if (marker.value === expected) {
    const activeDigest = readContentTree(target);
    return activeDigest.ok && activeDigest.value === sourceDigest.value
      ? ok(target)
      : fail("modified-file", `Active skill ${spec.targetName} differs from its pinned source.`, "Preserve the edited copy and reconcile it explicitly.");
  }
  if (marker.value !== null && !marker.value.startsWith(ownerPrefix)) {
    return fail("modified-file", `Existing skill ${spec.targetName} has different ownership.`, "Preserve the existing skill and reconcile ownership explicitly.");
  }
  if (marker.value !== null && marker.value.startsWith(ownerPrefix)) {
    // Previously owned by UPF at an earlier pinned version: replace cleanly.
    await rm(target, { recursive: true, force: true });
  }
  const existing = await readText(join(target, "SKILL.md"));
  if (!existing.ok) return existing;
  if (existing.value !== null) {
    return fail("unmanaged-file", `Existing skill ${spec.targetName} is unmanaged; preserve it.`, "Move or reconcile the unmanaged skill before rerunning setup.");
  }
  const created = await directory(project, target);
  if (!created.ok) return created;
  try {
    const entries = await readdir(target);
    if (entries.length > 0) return fail("unmanaged-file", `Existing skill directory ${spec.targetName} is not empty.`, "Preserve existing files and reconcile ownership before rerunning.");
    await cp(source, target, { recursive: true, errorOnExist: false, force: false });
    if (overrides?.has("SKILL.md")) {
      await writeFile(join(target, "SKILL.md"), overrides.get("SKILL.md") ?? "", "utf8");
    }
    await writeFile(join(target, ".upf-source"), expected, "utf8");
    return ok(target);
  } catch {
    return fail("partial-step", `Skill ${spec.targetName} could not be materialized; inspect its partial directory before resuming.`, "Clean or reconcile the partial skill directory, then rerun setup.");
  }
};

export const discoverHost = (project: string, input: BootstrapInput, environment: HostEnvironment): Promise<Result<readonly DiscoveredSkill[]>> =>
  HOSTS[input.host].discover(hostContext(project, input, environment));

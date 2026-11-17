import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";

import { normalizeCanonicalPlugin, sha256, stableJson, type Result } from "@agent-plugins/compiler";
import { loadPluginRoot, type OnboardedPlugin, type PluginInspection } from "@agent-plugins/core";
import {
  EMPTY_LOCK,
  LOCK_FILE,
  parseLock,
  parseRange,
  type BindingFacts,
  type InstalledPlugin,
  type OnboardedLock,
  type WorkflowAdapter,
} from "@agent-plugins/workflows";

/** A JSON file as read: absent, a parsed value, or present but not valid JSON. */
export type JsonFile =
  | { readonly kind: "absent" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "unreadable"; readonly path: string };

/** The reads the plugin-facing commands need, injected so their logic is testable without a disk. */
export interface PluginFactsIo {
  readonly readJson: (path: string) => JsonFile;
  /** The framework plugin, whose manifest declares the onboarded plugins. */
  readonly inspectPlugin: (root: string) => PluginInspection;
  /** An onboarded plugin as found at a root: a portable plugin, a Claude Code plugin, or a bare folder of skills. */
  readonly readPlugin: (root: string) => Result<PluginRead>;
}

/**
 * What a plugin root yields. A bare skills folder has no manifest, so its name comes from the `name=dir` argument and
 * its version from the framework's declared range.
 */
export type PluginRead = {
  readonly name: string | undefined;
  readonly version: string | undefined;
  readonly checksum: string;
  readonly skills: readonly string[];
};

/**
 * A `--plugin-root` argument: a directory, optionally named as `name=dir` or `name@version=dir` for plugins without a
 * manifest, so a release of such a plugin can be given its version.
 */
export type PluginRootArg = { readonly path: string; readonly name: string | undefined; readonly version: string | undefined };

const NAMED_ROOT = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:@(\d+\.\d+\.\d+))?=(.+)$/;

/** Parses a `--plugin-root` value; `cwd` resolves relative paths. */
export const parseRootArg =
  (cwd: string) =>
  (text: string): PluginRootArg => {
    const named = NAMED_ROOT.exec(text);
    return named === null
      ? { path: resolve(cwd, text), name: undefined, version: undefined }
      : { path: resolve(cwd, named[3] ?? ""), name: named[1], version: named[2] };
  };

/** Facts gathered from disk, or every configuration problem found. */
export type Gathered<A> = { readonly kind: "facts"; readonly facts: A } | { readonly kind: "config-error"; readonly problems: readonly string[] };

const facts = <A>(value: A): Gathered<A> => ({ kind: "facts", facts: value });
const configProblems = <A>(problems: readonly string[]): Gathered<A> => ({ kind: "config-error", problems });
const problemsOf = <A>(gathered: Gathered<A>): readonly string[] => (gathered.kind === "config-error" ? gathered.problems : []);

/** Prints configuration problems and returns the configuration exit code. */
export const configError = (io: { readonly err: (line: string) => void }, problems: readonly string[]): number => {
  io.err(`Configuration problems:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  return 2;
};

/** Node's parser throws on unknown or malformed options; turn that into a value at this boundary. */
export const tokenize = <O extends NonNullable<ParseArgsConfig["options"]>>(argv: readonly string[], options: O) => {
  try {
    return parseArgs({ args: [...argv], options, allowPositionals: true, strict: true });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** Configuration problems in the inspected framework plugin. */
export const errorsOf = (label: string, inspection: PluginInspection): readonly string[] =>
  inspection.manifest === undefined
    ? [`${label} has no readable plugin manifest.`]
    : inspection.diagnostics
        .filter(({ severity }) => severity === "error")
        .map(({ code, message, path }) => `${label}: ${code} ${message}${path === undefined ? "" : ` (${path})`}`);

/** The version a declared range starts at: what a manifest-less plugin is taken to be when none is given. */
const declaredFloor = (onboarded: readonly OnboardedPlugin[], name: string): string | undefined => {
  const range = parseRange(onboarded.find((plugin) => plugin.name === name)?.version ?? "");
  return range === undefined ? undefined : range.floor.join(".");
};

type Resolved = { readonly ok: true; readonly entry: readonly [string, InstalledPlugin] } | { readonly ok: false; readonly problems: readonly string[] };

/** A manifest's version and a version given on the command line must agree; one alone is enough. */
const versionConflict = (arg: PluginRootArg, read: PluginRead): string | undefined =>
  arg.version !== undefined && read.version !== undefined && arg.version !== read.version
    ? `Plugin root ${arg.path} is version ${read.version} by its manifest, not ${arg.version} as given.`
    : undefined;

const resolveRead = (arg: PluginRootArg, read: Result<PluginRead>, onboarded: readonly OnboardedPlugin[]): Resolved => {
  const name = read.ok ? (arg.name ?? read.value.name) : undefined;
  const version = read.ok && name !== undefined ? (read.value.version ?? arg.version ?? declaredFloor(onboarded, name)) : undefined;
  const conflict = read.ok ? versionConflict(arg, read.value) : undefined;
  return !read.ok
    ? { ok: false, problems: read.diagnostics.map(({ code, message, path }) => `Plugin root ${arg.path}: ${code} ${message}${path === undefined ? "" : ` (${path})`}`) }
    : name === undefined
      ? { ok: false, problems: [`Plugin root ${arg.path} has no manifest: name it as --plugin-root <plugin>@<version>=${arg.path}.`] }
      : conflict !== undefined
        ? { ok: false, problems: [conflict] }
        : version === undefined
          ? { ok: false, problems: [`Plugin root ${arg.path} has no version: give it as --plugin-root ${name}@<version>=${arg.path}.`] }
          : { ok: true, entry: [name, { version, checksum: read.value.checksum, skills: read.value.skills }] };
};

const duplicates = (names: readonly string[]): readonly string[] => [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];

/** Each plugin root as an installed plugin keyed by name; two roots for one plugin are a configuration problem. */
export const installedFrom = (
  io: PluginFactsIo,
  roots: readonly PluginRootArg[],
  onboarded: readonly OnboardedPlugin[],
): Gathered<ReadonlyMap<string, InstalledPlugin>> => {
  const resolved = roots.map((arg) => resolveRead(arg, io.readPlugin(arg.path), onboarded));
  const entries = resolved.flatMap((result) => (result.ok ? [result.entry] : []));
  const problems = [
    ...resolved.flatMap((result) => (result.ok ? [] : result.problems)),
    ...duplicates(entries.map(([name]) => name)).map((name) => `More than one --plugin-root provides ${name}.`),
  ];
  return problems.length > 0 ? configProblems(problems) : facts(new Map(entries));
};

/** The framework's lock: absent is the empty lock; unreadable or malformed is a configuration problem. */
export const lockFrom = (io: PluginFactsIo, framework: string): Gathered<OnboardedLock> => {
  const file = io.readJson(join(framework, LOCK_FILE));
  switch (file.kind) {
    case "absent":
      return facts(EMPTY_LOCK);
    case "unreadable":
      return configProblems([`Could not read valid JSON from ${file.path}.`]);
    case "value": {
      const parsed = parseLock(file.value);
      return parsed.ok ? facts(parsed.lock) : configProblems([parsed.message]);
    }
  }
};

/** The plugin side of a check, read from the framework and the given plugin roots. */
export const gatherBinding = (
  io: PluginFactsIo,
  adapter: WorkflowAdapter<string>,
  framework: string,
  roots: readonly PluginRootArg[],
): Gathered<BindingFacts> => {
  const inspection = io.inspectPlugin(framework);
  const installed = installedFrom(io, roots, inspection.onboardedPlugins ?? []);
  const lock = lockFrom(io, framework);
  const problems = [...errorsOf(`Framework ${framework}`, inspection), ...problemsOf(installed), ...problemsOf(lock)];
  return installed.kind === "facts" && lock.kind === "facts" && problems.length === 0
    ? facts({ adapter, onboarded: inspection.onboardedPlugins ?? [], lock: lock.facts, installed: installed.facts })
    : configProblems(problems);
};

// Edge interpreters: the real filesystem.

export const readJsonFromDisk = (path: string): JsonFile => {
  if (!existsSync(path)) return { kind: "absent" };
  try {
    return { kind: "value", value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch {
    return { kind: "unreadable", path };
  }
};

type SkillFile = { readonly path: string; readonly content: string };

/** Names in code-point order, built without sorting in place. */
const sortedNames = (names: readonly string[]): readonly string[] =>
  names.reduce<readonly string[]>((sorted, name) => [...sorted.filter((x) => x < name), name, ...sorted.filter((x) => x >= name)], []);

/** The skill folders under `dir` that hold a `SKILL.md`, in name order. */
const skillFiles = (dir: string): readonly SkillFile[] =>
  existsSync(dir)
    ? sortedNames(readdirSync(dir).filter((name) => existsSync(join(dir, name, "SKILL.md"))))
        .map((name) => ({ path: `${name}/SKILL.md`, content: readFileSync(join(dir, name, "SKILL.md"), "utf8") }))
    : [];

/** A digest of files as text with line endings normalised, so a checkout on any platform hashes the same. */
const textDigest = (files: readonly SkillFile[]): string =>
  sha256(stableJson(files.map(({ path, content }) => ({ path, content: content.replace(/\r\n/g, "\n") }))));

const skillNamesOf = (files: readonly SkillFile[]): readonly string[] => files.map(({ path }) => dirname(path));

const missingSkills = (root: string): Result<PluginRead> => ({
  ok: false,
  diagnostics: [{ severity: "error", code: "plugin.root.unrecognised", message: "No plugin manifest and no skills/<name>/SKILL.md were found.", path: root }],
});

/** A Claude Code plugin: `.claude-plugin/plugin.json` names it; the checksum covers that manifest and every skill. */
const readClaudePlugin = (root: string): Result<PluginRead> => {
  const manifestText = readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8");
  const manifest = JSON.parse(manifestText) as { readonly name?: unknown; readonly version?: unknown };
  const skills = skillFiles(join(root, "skills"));
  return {
    ok: true,
    value: {
      name: typeof manifest.name === "string" ? manifest.name : undefined,
      version: typeof manifest.version === "string" ? manifest.version : undefined,
      checksum: textDigest([{ path: ".claude-plugin/plugin.json", content: manifestText }, ...skills]),
      skills: skillNamesOf(skills),
    },
  };
};

/** A bare folder of skills, either `<root>/skills/*` or `<root>/*`; name and version come from elsewhere. */
const readSkillsFolder = (root: string): Result<PluginRead> => {
  const nested = skillFiles(join(root, "skills"));
  const skills = nested.length > 0 ? nested : skillFiles(root);
  return skills.length === 0
    ? missingSkills(root)
    : { ok: true, value: { name: undefined, version: undefined, checksum: textDigest(skills), skills: skillNamesOf(skills) } };
};

/** A portable plugin, read by the compiler as for payloads; its checksum is the compiler's source digest. */
const readPortablePlugin = (root: string): Result<PluginRead> => {
  const canonical = normalizeCanonicalPlugin(root);
  return canonical.ok
    ? {
        ok: true,
        value: {
          name: canonical.value.manifest.name,
          version: canonical.value.manifest.version,
          checksum: canonical.value.sourceDigest,
          skills: canonical.value.skills.map(({ path }) => basename(dirname(path))),
        },
      }
    : canonical;
};

/** A Claude Code plugin whose manifest cannot be read or parsed is a diagnostic, not a crash. */
const readClaudePluginSafely = (root: string): Result<PluginRead> => {
  try {
    return readClaudePlugin(root);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{ severity: "error", code: "plugin.manifest.unreadable", message: error instanceof Error ? error.message : String(error), path: root }],
    };
  }
};

type Layout = "portable" | "claude" | "skills";

const layoutOf = (root: string): Layout =>
  existsSync(join(root, "plugin.json")) ? "portable" : existsSync(join(root, ".claude-plugin", "plugin.json")) ? "claude" : "skills";

// Edge interpreter: picks the reader by the layout found on disk.
const readPluginFromDisk = (root: string): Result<PluginRead> => {
  switch (layoutOf(root)) {
    case "portable":
      return readPortablePlugin(root);
    case "claude":
      return readClaudePluginSafely(root);
    case "skills":
      return readSkillsFolder(root);
  }
};

export const NODE_PLUGIN_FACTS_IO: PluginFactsIo = Object.freeze({
  readJson: readJsonFromDisk,
  inspectPlugin: loadPluginRoot,
  readPlugin: readPluginFromDisk,
});

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";

import { normalizeCanonicalPlugin, type CanonicalPlugin, type Result } from "@agent-plugins/compiler";
import { loadPluginRoot, type PluginInspection } from "@agent-plugins/core";
import {
  EMPTY_LOCK,
  LOCK_FILE,
  parseLock,
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
  /** An onboarded plugin's source as the compiler reads it, carrying its content digest. */
  readonly readPlugin: (root: string) => Result<CanonicalPlugin>;
}

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

const installedPlugin = (plugin: CanonicalPlugin): readonly [string, InstalledPlugin] => [
  plugin.manifest.name,
  { version: plugin.manifest.version, checksum: plugin.sourceDigest, skills: plugin.skills.map(({ path }) => basename(dirname(path))) },
];

const readProblems = (root: string, read: Result<CanonicalPlugin>): readonly string[] =>
  read.ok ? [] : read.diagnostics.map(({ code, message, path }) => `Plugin root ${root}: ${code} ${message}${path === undefined ? "" : ` (${path})`}`);

const duplicates = (names: readonly string[]): readonly string[] => [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];

/** Each plugin root as an installed plugin keyed by manifest name; two roots for one plugin are a configuration problem. */
export const installedFrom = (io: PluginFactsIo, roots: readonly string[]): Gathered<ReadonlyMap<string, InstalledPlugin>> => {
  const reads = roots.map((root) => [root, io.readPlugin(root)] as const);
  const entries = reads.flatMap(([, read]) => (read.ok ? [installedPlugin(read.value)] : []));
  const problems = [
    ...reads.flatMap(([root, read]) => readProblems(root, read)),
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
  roots: readonly string[],
): Gathered<BindingFacts> => {
  const inspection = io.inspectPlugin(framework);
  const installed = installedFrom(io, roots);
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

export const NODE_PLUGIN_FACTS_IO: PluginFactsIo = Object.freeze({
  readJson: readJsonFromDisk,
  inspectPlugin: loadPluginRoot,
  readPlugin: normalizeCanonicalPlugin,
});

import { join, resolve } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";

import type { Result } from "@agent-plugins/compiler";
import type { Diagnostic, OnboardedPlugin, PluginInspection } from "@agent-plugins/core";
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
  /** An onboarded plugin as found at a root: a portable plugin, or a folder of skills with or without a manifest. */
  readonly readPlugin: (root: string) => Result<PluginRead>;
}

/** What a plugin root yields; a plugin without a manifest has no name or version of its own. */
export type PluginRead = {
  readonly name: string | undefined;
  readonly version: string | undefined;
  readonly checksum: string;
  readonly skills: readonly string[];
};

/** A `--plugin-root` argument: a directory, optionally named as `name=dir` or `name@version=dir`. */
export type PluginRootArg = { readonly path: string; readonly name: string | undefined; readonly version: string | undefined };

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

const NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const RELEASE = /^\d+\.\d+\.\d+$/;
const NAMED_PREFIX = /^([a-z0-9][a-z0-9-]*)(?:@([^=]*))?=(.+)$/;

/** A parsed `--plugin-root` value, or why the `name[@version]=dir` form is malformed. */
export type ParsedRoot = { readonly ok: true; readonly root: PluginRootArg } | { readonly ok: false; readonly message: string };

/** Every parsed `--plugin-root` value, or the first malformed one. */
export type ParsedRoots = { readonly ok: true; readonly roots: readonly PluginRootArg[] } | { readonly ok: false; readonly message: string };

const namedRoot = (cwd: string, text: string, [, name = "", version, path = ""]: RegExpExecArray): ParsedRoot =>
  !NAME.test(name)
    ? { ok: false, message: `--plugin-root ${text}: "${name}" is not a plugin name.` }
    : version !== undefined && !RELEASE.test(version)
      ? { ok: false, message: `--plugin-root ${text}: "${version}" is not a release version (x.y.z).` }
      : { ok: true, root: { path: resolve(cwd, path), name, version } };

/** Parses a `--plugin-root` value; `cwd` resolves relative paths. */
export const parseRootArg =
  (cwd: string) =>
  (text: string): ParsedRoot => {
    const named = NAMED_PREFIX.exec(text);
    return named === null ? { ok: true, root: { path: resolve(cwd, text), name: undefined, version: undefined } } : namedRoot(cwd, text, named);
  };

/** Parses every `--plugin-root` value, or names the first malformed one. */
export const parseRootArgs = (cwd: string, values: readonly string[]): ParsedRoots => {
  const parsed = values.map(parseRootArg(cwd));
  const invalid = parsed.find((root): root is { readonly ok: false; readonly message: string } => !root.ok);
  return invalid === undefined ? { ok: true, roots: parsed.flatMap((root) => (root.ok ? [root.root] : [])) } : invalid;
};

/** One diagnostic as a configuration problem line, labelled with where it came from. */
const diagnosticLine =
  (label: string) =>
  ({ code, message, path }: Diagnostic): string =>
    `${label}: ${code} ${message}${path === undefined ? "" : ` (${path})`}`;

/** Configuration problems in the inspected framework plugin. */
export const errorsOf = (label: string, inspection: PluginInspection): readonly string[] =>
  inspection.manifest === undefined
    ? [`${label} has no readable plugin manifest.`]
    : inspection.diagnostics.filter(({ severity }) => severity === "error").map(diagnosticLine(label));

type ResolveContext = { readonly onboarded: readonly OnboardedPlugin[]; readonly lock: OnboardedLock };

/** The version a declared range starts at. */
const declaredFloor = (onboarded: readonly OnboardedPlugin[], name: string): string | undefined => {
  const range = parseRange(onboarded.find((plugin) => plugin.name === name)?.version ?? "");
  return range === undefined ? undefined : range.floor.join(".");
};

/**
 * The version a plugin is: its manifest's, or the one given. A plugin with neither takes the version of a pin with
 * exactly its content, so an adopted release keeps its version, and otherwise the declared range's starting version.
 */
const versionOf = (arg: PluginRootArg, read: PluginRead, name: string, context: ResolveContext): string | undefined =>
  read.version ??
  arg.version ??
  context.lock.plugins.find((pin) => pin.plugin === name && pin.checksum === read.checksum)?.version ??
  declaredFloor(context.onboarded, name);

/** A name or version given on the command line must agree with the plugin's own manifest. */
const conflicts = (arg: PluginRootArg, read: PluginRead): readonly string[] => [
  ...(arg.name !== undefined && read.name !== undefined && arg.name !== read.name
    ? [`Plugin root ${arg.path} is ${read.name} by its manifest, not ${arg.name} as given.`]
    : []),
  ...(arg.version !== undefined && read.version !== undefined && arg.version !== read.version
    ? [`Plugin root ${arg.path} is version ${read.version} by its manifest, not ${arg.version} as given.`]
    : []),
];

const resolvePresent = (arg: PluginRootArg, read: PluginRead, context: ResolveContext): Gathered<readonly [string, InstalledPlugin]> => {
  const name = read.name ?? arg.name;
  const version = name === undefined ? undefined : versionOf(arg, read, name, context);
  const conflicting = conflicts(arg, read);
  return conflicting.length > 0
    ? configProblems(conflicting)
    : name === undefined
      ? configProblems([`Plugin root ${arg.path} has no manifest: name it as --plugin-root <plugin>@<version>=${arg.path}.`])
      : version === undefined
        ? configProblems([`Plugin root ${arg.path} has no version: give it as --plugin-root ${name}@<version>=${arg.path}.`])
        : facts([name, { version, checksum: read.checksum, skills: read.skills }] as const);
};

const resolveRead = (arg: PluginRootArg, read: Result<PluginRead>, context: ResolveContext): Gathered<readonly [string, InstalledPlugin]> =>
  read.ok ? resolvePresent(arg, read.value, context) : configProblems(read.diagnostics.map(diagnosticLine(`Plugin root ${arg.path}`)));

const duplicates = (names: readonly string[]): readonly string[] => [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];

/** Each plugin root as an installed plugin keyed by name; two roots for one plugin are a configuration problem. */
export const installedFrom = (
  io: PluginFactsIo,
  roots: readonly PluginRootArg[],
  context: ResolveContext,
): Gathered<ReadonlyMap<string, InstalledPlugin>> => {
  const resolved = roots.map((arg) => resolveRead(arg, io.readPlugin(arg.path), context));
  const entries = resolved.flatMap((result) => (result.kind === "facts" ? [result.facts] : []));
  const problems = [
    ...resolved.flatMap(problemsOf),
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
  const onboarded = inspection.onboardedPlugins ?? [];
  const lock = lockFrom(io, framework);
  const installed = installedFrom(io, roots, { onboarded, lock: lock.kind === "facts" ? lock.facts : EMPTY_LOCK });
  const problems = [...errorsOf(`Framework ${framework}`, inspection), ...problemsOf(installed), ...problemsOf(lock)];
  return installed.kind === "facts" && lock.kind === "facts" && problems.length === 0
    ? facts({ adapter, onboarded, lock: lock.facts, installed: installed.facts })
    : configProblems(problems);
};

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { normalizeCanonicalPlugin } from "@agent-plugins/compiler";
import { loadPluginRoot, type PluginInspection } from "@agent-plugins/core";
import { EMPTY_LOCK, LOCK_FILE, parseLock, type InstalledPlugin, type OnboardedLock } from "@agent-plugins/workflows";

/** A JSON file as read: absent, a parsed value, or present but not valid JSON. */
export type JsonFile =
  | { readonly kind: "absent" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "unreadable"; readonly path: string };

/** The reads the plugin-facing commands need, injected so their logic is testable without a disk. */
export interface PluginFactsIo {
  readonly readJson: (path: string) => JsonFile;
  readonly inspectPlugin: (root: string) => PluginInspection;
  /** The compiler's content digest for a plugin source, or `undefined` when it cannot be computed. */
  readonly digestPlugin: (root: string) => string | undefined;
}

/** Facts gathered from disk, or every configuration problem found. */
export type Gathered<A> = { readonly kind: "facts"; readonly facts: A } | { readonly kind: "config-error"; readonly problems: readonly string[] };

/** Configuration problems in one inspected plugin root. */
export const errorsOf = (label: string, inspection: PluginInspection): readonly string[] =>
  inspection.manifest === undefined
    ? [`${label} has no readable plugin manifest.`]
    : inspection.diagnostics
        .filter(({ severity }) => severity === "error")
        .map(({ code, message, path }) => `${label}: ${code} ${message}${path === undefined ? "" : ` (${path})`}`);

/** An installed plugin's skill names: each skill's directory name. */
const skillNames = (inspection: PluginInspection): readonly string[] =>
  (inspection.skills ?? []).map(({ path }) => basename(dirname(path)));

type Observed = readonly [string, PluginInspection, string | undefined];

const observe = (io: PluginFactsIo, root: string): Observed => [root, io.inspectPlugin(root), io.digestPlugin(root)];

const observedProblems = ([root, inspection, checksum]: Observed): readonly string[] => [
  ...errorsOf(`Plugin root ${root}`, inspection),
  ...(inspection.manifest !== undefined && checksum === undefined ? [`Plugin root ${root} has no computable content checksum.`] : []),
];

const installedEntry = ([, inspection, checksum]: Observed): readonly [string, InstalledPlugin] => [
  inspection.manifest?.name ?? "",
  { version: inspection.manifest?.version ?? "", checksum: checksum ?? "", skills: skillNames(inspection) },
];

/** Each plugin root as an installed plugin keyed by manifest name, with any problems reading them. */
export const installedFrom = (
  io: PluginFactsIo,
  roots: readonly string[],
): { readonly problems: readonly string[]; readonly installed: ReadonlyMap<string, InstalledPlugin> } => {
  const observed = roots.map((root) => observe(io, root));
  return { problems: observed.flatMap(observedProblems), installed: new Map(observed.map(installedEntry)) };
};

/** The framework's lock: absent is the empty lock; unreadable or malformed is a configuration problem. */
export const lockFrom = (
  io: PluginFactsIo,
  framework: string,
): { readonly problems: readonly string[]; readonly lock: OnboardedLock } => {
  const file = io.readJson(join(framework, LOCK_FILE));
  const parsed = file.kind === "value" ? parseLock(file.value) : undefined;
  return file.kind === "absent"
    ? { problems: [], lock: EMPTY_LOCK }
    : file.kind === "unreadable"
      ? { problems: [`Could not read valid JSON from ${file.path}.`], lock: EMPTY_LOCK }
      : parsed?.ok === true
        ? { problems: [], lock: parsed.lock }
        : { problems: [parsed?.message ?? `${LOCK_FILE} is invalid.`], lock: EMPTY_LOCK };
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

const digestFromDisk = (root: string): string | undefined => {
  const canonical = normalizeCanonicalPlugin(root);
  return canonical.ok ? canonical.value.sourceDigest : undefined;
};

export const NODE_PLUGIN_FACTS_IO: PluginFactsIo = Object.freeze({
  readJson: readJsonFromDisk,
  inspectPlugin: loadPluginRoot,
  digestPlugin: digestFromDisk,
});

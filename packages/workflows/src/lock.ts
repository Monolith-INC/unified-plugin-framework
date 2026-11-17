import { sha256, stableJson, type JsonValue } from "@agent-plugins/compiler";
import { WORKFLOW_NAMES, type WorkflowName } from "@agent-plugins/core";

import type { WorkflowAdapter } from "./adapter.js";

/** The lock beside the framework manifest: one pin per onboarded plugin, like `package-lock.json` beside `package.json`. */
export const LOCK_FILE = "onboarded.lock.json";

/**
 * One onboarded plugin as last accepted by its adapter's checks: the exact version, the content digest the compiler
 * computes for a plugin source, and the adapter mapping it was checked against.
 */
export interface PluginPin {
  readonly plugin: string;
  readonly version: string;
  readonly checksum: string;
  readonly adapter: WorkflowName;
  readonly contractVersion: string;
  readonly mappingDigest: string;
}

export interface OnboardedLock {
  readonly lockVersion: 1;
  readonly plugins: readonly PluginPin[];
}

export const EMPTY_LOCK: OnboardedLock = Object.freeze({ lockVersion: 1, plugins: Object.freeze([]) });

/** A parsed lock, or why the file is not one. */
export type ParsedLock = { readonly ok: true; readonly lock: OnboardedLock } | { readonly ok: false; readonly message: string };

const PIN_FIELDS = ["plugin", "version", "checksum", "adapter", "contractVersion", "mappingDigest"] as const;
const WORKFLOWS: ReadonlySet<string> = new Set(WORKFLOW_NAMES);
const SHA256 = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPin = (value: unknown): value is PluginPin =>
  isRecord(value) &&
  Object.keys(value).length === PIN_FIELDS.length &&
  PIN_FIELDS.every((field) => typeof value[field] === "string" && value[field] !== "") &&
  WORKFLOWS.has(value["adapter"] as string) &&
  SHA256.test(value["checksum"] as string) &&
  SHA256.test(value["mappingDigest"] as string);

const uniquePlugins = (pins: readonly PluginPin[]): boolean => new Set(pins.map(({ plugin }) => plugin)).size === pins.length;

/** Parses lock file JSON; an absent file is the empty lock, decided by the caller. */
export const parseLock = (value: unknown): ParsedLock =>
  isRecord(value) &&
  value["lockVersion"] === 1 &&
  Array.isArray(value["plugins"]) &&
  value["plugins"].every(isPin) &&
  uniquePlugins(value["plugins"] as readonly PluginPin[])
    ? { ok: true, lock: { lockVersion: 1, plugins: value["plugins"] as readonly PluginPin[] } }
    : { ok: false, message: `${LOCK_FILE} must hold lockVersion 1 and one complete pin per plugin.` };

/** The pin for a plugin, if the lock has one. */
export const pinFor = (lock: OnboardedLock, plugin: string): PluginPin | undefined =>
  lock.plugins.find((pin) => pin.plugin === plugin);

/** The lock with `pin` replacing any pin for the same plugin, kept sorted by plugin name. Pure. */
export const withPin = (lock: OnboardedLock, pin: PluginPin): OnboardedLock => ({
  lockVersion: 1,
  // A fresh array, so sorting it in place mutates nothing shared.
  plugins: [...lock.plugins.filter(({ plugin }) => plugin !== pin.plugin), pin].sort((x, y) =>
    x.plugin < y.plugin ? -1 : x.plugin > y.plugin ? 1 : 0,
  ),
});

/** The lock file's text: stable key order, so an unchanged lock is byte-identical. */
export const lockText = (lock: OnboardedLock): string => stableJson(lock as unknown as JsonValue);

/** A digest of what an adapter maps, so a changed mapping invalidates the pins checked against the old one. */
export const mappingDigest = (adapter: WorkflowAdapter<string>): string =>
  sha256(stableJson({ fulfil: adapter.fulfil, knowledgeStores: adapter.knowledgeStores } as unknown as JsonValue));

type Version = readonly [number, number, number];

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

const parseVersion = (text: string): Version | undefined => {
  const match = VERSION.exec(text);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compare = (x: Version, y: Version): number => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/** The first version a range excludes: `^` keeps the leftmost non-zero part, `~` keeps major and minor. */
const ceiling = (operator: string, [major, minor, patch]: Version): Version | undefined =>
  operator === "^"
    ? major > 0
      ? [major + 1, 0, 0]
      : minor > 0
        ? [0, minor + 1, 0]
        : [0, 0, patch + 1]
    : operator === "~"
      ? [major, minor + 1, 0]
      : undefined;

/**
 * Whether `version` is inside `range`, for the ranges manifests use: an exact `x.y.z`, `^x.y.z` or `~x.y.z`.
 * Pre-release versions and any other range syntax never match, so an unsupported range fails closed.
 */
export const satisfiesRange = (version: string, range: string): boolean => {
  const candidate = parseVersion(version);
  const operator = range.startsWith("^") || range.startsWith("~") ? range[0] ?? "" : "";
  const floor = parseVersion(range.slice(operator.length));
  const top = floor === undefined ? undefined : ceiling(operator, floor);
  return candidate === undefined || floor === undefined
    ? false
    : top === undefined
      ? compare(candidate, floor) === 0
      : compare(candidate, floor) >= 0 && compare(candidate, top) < 0;
};

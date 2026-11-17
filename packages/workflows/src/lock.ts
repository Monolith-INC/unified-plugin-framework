import { stableJson } from "@agent-plugins/compiler";
import { WORKFLOW_ADAPTERS, type WorkflowName } from "@agent-plugins/core";

/** The lock beside the framework manifest: one pin per onboarded plugin, like `package-lock.json` beside `package.json`. */
export const LOCK_FILE = "onboarded.lock.json";

/**
 * One onboarded plugin as last accepted by its adapter's checks: the exact version, the compiler's content digest of
 * the plugin source, and the adapter, contract version and mapping digest it was checked against.
 */
export type PluginPin = {
  readonly plugin: string;
  readonly version: string;
  readonly checksum: string;
  readonly adapter: WorkflowName;
  readonly contractVersion: string;
  readonly mappingDigest: string;
};

export type OnboardedLock = {
  readonly lockVersion: 1;
  readonly plugins: readonly PluginPin[];
};

export const EMPTY_LOCK: OnboardedLock = Object.freeze({ lockVersion: 1, plugins: Object.freeze([]) });

/** A parsed lock, or why the file is not one. */
export type ParsedLock = { readonly ok: true; readonly lock: OnboardedLock } | { readonly ok: false; readonly message: string };

const PIN_FIELDS = ["plugin", "version", "checksum", "adapter", "contractVersion", "mappingDigest"] as const;
const SHA256 = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A pin field's text, or `undefined` when it is missing, not a string, or empty. */
const field = (value: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const text = value[key];
  return typeof text === "string" && text !== "" ? text : undefined;
};

const isDigest = (text: string | undefined): boolean => text !== undefined && SHA256.test(text);

const isPin = (value: unknown): value is PluginPin =>
  isRecord(value) &&
  Object.keys(value).length === PIN_FIELDS.length &&
  PIN_FIELDS.every((key) => field(value, key) !== undefined) &&
  WORKFLOW_ADAPTERS.has(field(value, "adapter") ?? "") &&
  isDigest(field(value, "checksum")) &&
  isDigest(field(value, "mappingDigest"));

const isPinList = (value: unknown): value is readonly PluginPin[] =>
  Array.isArray(value) && value.every(isPin) && new Set(value.map(({ plugin }: PluginPin) => plugin)).size === value.length;

/** Parses lock file JSON; an absent file is the empty lock, decided by the caller. */
export const parseLock = (value: unknown): ParsedLock => {
  const plugins = isRecord(value) && value["lockVersion"] === 1 ? value["plugins"] : undefined;
  return isPinList(plugins)
    ? { ok: true, lock: { lockVersion: 1, plugins } }
    : { ok: false, message: `${LOCK_FILE} must hold lockVersion 1 and one complete pin per plugin.` };
};

/** The pin for a plugin, if the lock has one. */
export const pinFor = (lock: OnboardedLock, plugin: string): PluginPin | undefined =>
  lock.plugins.find((pin) => pin.plugin === plugin);

/** Inserts a pin into a list sorted by plugin name; plugin names in a lock are unique. */
const insertByPlugin = (sorted: readonly PluginPin[], pin: PluginPin): readonly PluginPin[] => [
  ...sorted.filter(({ plugin }) => plugin < pin.plugin),
  pin,
  ...sorted.filter(({ plugin }) => plugin > pin.plugin),
];

/** The lock with `pin` replacing any pin for the same plugin, kept sorted by plugin name. Pure. */
export const withPin = (lock: OnboardedLock, pin: PluginPin): OnboardedLock => ({
  lockVersion: 1,
  plugins: [...lock.plugins.filter(({ plugin }) => plugin !== pin.plugin), pin].reduce<readonly PluginPin[]>(insertByPlugin, []),
});

/** The lock file's text: stable key order, so an unchanged lock is byte-identical. */
export const lockText = (lock: OnboardedLock): string => stableJson(lock);

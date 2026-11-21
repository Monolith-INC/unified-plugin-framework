import { sha256, stableJson } from "@agent-plugins/compiler";
import { WORKFLOW_ADAPTERS, type WorkflowName } from "@agent-plugins/core";

/** The lock inside UPF's reverse-domain extension directory (Agent Plugins v1.0.0 §8). */
export const LOCK_FILE = "io.github.monolith-inc.upf/onboarded.lock.json";
/** Legacy lock location beside `plugin.json`, still accepted as a read fallback for older fixtures. */
export const LEGACY_LOCK_FILE = "onboarded.lock.json";

/** Underlying plugin identity and previously reviewed public files, independent of selection growth. */
export type ContentSource = {
  readonly checksum: string;
  readonly files: Readonly<Record<string, string>>;
};

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
  readonly contentSource?: ContentSource;
};

/** One source identity, with independently checked workflow mappings. */
export type WorkflowPin = Pick<PluginPin, "adapter" | "contractVersion" | "mappingDigest"> & {
  readonly files?: Readonly<Record<string, string>>;
};
export type SharedPluginPin = Pick<PluginPin, "plugin" | "version" | "checksum"> & {
  readonly bindings: readonly WorkflowPin[];
};
export type LockedPlugin = PluginPin | SharedPluginPin;

/** Canonical source identity is independent of a workflow's public-content selection. */
export const pluginSourceChecksum = (pin: LockedPlugin): string => "bindings" in pin ? pin.checksum : pin.contentSource?.checksum ?? pin.checksum;

export type OnboardedLock = {
  readonly lockVersion: 1 | 2;
  readonly plugins: readonly LockedPlugin[];
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

const isContentSource = (value: unknown): value is ContentSource => isRecord(value)
  && Object.keys(value).length === 2 && isDigest(field(value, "checksum")) && isRecord(value.files)
  && Object.entries(value.files).every(([path, digest]) => path.length > 0 && typeof digest === "string" && isDigest(digest));

const isPin = (value: unknown): value is PluginPin =>
  isRecord(value) &&
  Object.keys(value).every((key) => (PIN_FIELDS as readonly string[]).includes(key) || key === "contentSource") &&
  (value.contentSource === undefined || isContentSource(value.contentSource)) &&
  PIN_FIELDS.every((key) => field(value, key) !== undefined) &&
  WORKFLOW_ADAPTERS.has(field(value, "adapter") ?? "") &&
  isDigest(field(value, "checksum")) &&
  isDigest(field(value, "mappingDigest"));

const isPinList = (value: unknown): value is readonly PluginPin[] =>
  Array.isArray(value) && value.every(isPin) && new Set(value.map(({ plugin }: PluginPin) => plugin)).size === value.length;

const isFiles = (value: unknown): value is Readonly<Record<string, string>> => isRecord(value)
  && Object.entries(value).every(([path, digest]) => path.length > 0 && typeof digest === "string" && isDigest(digest));
const isBinding = (value: unknown): value is WorkflowPin => isRecord(value)
  && Object.keys(value).every((key) => ["adapter", "contractVersion", "mappingDigest", "files"].includes(key))
  && WORKFLOW_ADAPTERS.has(field(value, "adapter") ?? "") && field(value, "contractVersion") !== undefined
  && isDigest(field(value, "mappingDigest")) && (value.files === undefined || isFiles(value.files));
const consistentFiles = (bindings: readonly WorkflowPin[]): boolean => bindings.every((binding) =>
  Object.entries(binding.files ?? {}).every(([path, digest]) => bindings.every((other) => other.files?.[path] === undefined || other.files[path] === digest)));
const isSharedPin = (value: unknown): value is SharedPluginPin => isRecord(value)
  && Object.keys(value).every((key) => ["plugin", "version", "checksum", "bindings"].includes(key))
  && field(value, "plugin") !== undefined && field(value, "version") !== undefined && isDigest(field(value, "checksum"))
  && Array.isArray(value.bindings) && value.bindings.length > 0 && value.bindings.every(isBinding)
  && new Set(value.bindings.map((binding) => binding.adapter)).size === value.bindings.length && consistentFiles(value.bindings);
const isSharedList = (value: unknown): value is readonly SharedPluginPin[] => Array.isArray(value) && value.every(isSharedPin)
  && new Set(value.map((pin) => pin.plugin)).size === value.length;

/** Parses lock file JSON; an absent file is the empty lock, decided by the caller. */
export const parseLock = (value: unknown): ParsedLock => {
  switch (true) {
    case isRecord(value) && value.lockVersion === 1 && isPinList(value.plugins):
      return { ok: true, lock: { lockVersion: 1, plugins: (value as { readonly plugins: readonly PluginPin[] }).plugins } };
    case isRecord(value) && value.lockVersion === 2 && isSharedList(value.plugins):
      return { ok: true, lock: { lockVersion: 2, plugins: (value as { readonly plugins: readonly SharedPluginPin[] }).plugins } };
    default:
      return { ok: false, message: `${LOCK_FILE} requires complete unique pins: legacy lockVersion 1 or shared-binding lockVersion 2. Preserve the file and use a compatible framework or re-pin to migrate.` };
  }
};

const boundPin = (source: SharedPluginPin, binding: WorkflowPin): PluginPin => ({
  plugin: source.plugin, version: source.version, adapter: binding.adapter, contractVersion: binding.contractVersion, mappingDigest: binding.mappingDigest,
  checksum: binding.files === undefined ? source.checksum : sha256(stableJson({ sourceChecksum: source.checksum, publicFiles: binding.files })),
  ...(binding.files === undefined ? {} : { contentSource: { checksum: source.checksum, files: binding.files } }),
});

/** Workflow views preserve the legacy API without duplicating a shared source identity on disk. */
export const bindingPins = (pin: LockedPlugin): readonly PluginPin[] => "bindings" in pin ? pin.bindings.map((binding) => boundPin(pin, binding)) : [pin];
export const pinFor = (lock: OnboardedLock, plugin: string, workflow?: WorkflowName): PluginPin | undefined =>
  lock.plugins.filter((pin) => pin.plugin === plugin).flatMap(bindingPins).find((pin) => workflow === undefined || pin.adapter === workflow);

const workflowPin = (pin: PluginPin): WorkflowPin => ({ adapter: pin.adapter, contractVersion: pin.contractVersion, mappingDigest: pin.mappingDigest,
  ...(pin.contentSource === undefined ? {} : { files: pin.contentSource.files }) });
const sharedPin = (pin: LockedPlugin): SharedPluginPin => "bindings" in pin ? pin : ({ plugin: pin.plugin, version: pin.version,
  checksum: pluginSourceChecksum(pin), bindings: [workflowPin(pin)] });

/** Inserts a pin into a list sorted by plugin name; plugin names in a lock are unique. */
const insertByPlugin = (sorted: readonly LockedPlugin[], pin: LockedPlugin): readonly LockedPlugin[] => [
  ...sorted.filter(({ plugin }) => plugin < pin.plugin),
  pin,
  ...sorted.filter(({ plugin }) => plugin > pin.plugin),
];

/** The lock with `pin` replacing any pin for the same plugin, kept sorted by plugin name. Pure. */
export const withPin = (lock: OnboardedLock, pin: PluginPin): OnboardedLock => {
  const previous = lock.plugins.find((entry) => entry.plugin === pin.plugin);
  const shared = lock.lockVersion === 2 || previous !== undefined && bindingPins(previous).some((binding) => binding.adapter !== pin.adapter);
  return { lockVersion: shared ? 2 : 1, plugins: [...lock.plugins.filter(({ plugin }) => plugin !== pin.plugin),
    shared ? mergeBinding(previous, pin) : pin].map((entry) => shared ? sharedPin(entry) : entry).reduce<readonly LockedPlugin[]>(insertByPlugin, []) };
};

/** A replacement source drops old mappings; they must be checked again rather than silently inherited. */
const mergeBinding = (previous: LockedPlugin | undefined, pin: PluginPin): SharedPluginPin => {
  const next = sharedPin(pin);
  const old = previous === undefined ? undefined : sharedPin(previous);
  const retained = old?.version === next.version && old.checksum === next.checksum ? old.bindings.filter((binding) => binding.adapter !== pin.adapter) : [];
  return { ...next, bindings: [...retained, workflowPin(pin)].reduce<readonly WorkflowPin[]>((sorted, entry) =>
    [...sorted.filter((b) => b.adapter < entry.adapter), entry, ...sorted.filter((b) => b.adapter > entry.adapter)], []) };
};

/** The lock file's text: stable key order, so an unchanged lock is byte-identical. */
export const lockText = (lock: OnboardedLock): string => stableJson(lock);

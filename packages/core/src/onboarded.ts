import type { Diagnostic } from "./index.js";

/** Manifest `extensions` key holding Unified Plugin Framework declarations. */
export const UPF_EXTENSION = "io.github.monolith-inc.upf";

/** Workflow adapters an onboarded plugin can serve. Grows as adapters are built. */
export const WORKFLOW_ADAPTERS: ReadonlySet<string> = new Set(["code-review"]);

export const onboardedDiagnosticCodes = {
  upfExtensionInvalid: "upf.extension.invalid",
  onboardedPluginInvalidType: "upf.onboardedPlugin.invalid_type",
  onboardedPluginFieldRequired: "upf.onboardedPlugin.field.required",
  onboardedPluginAdapterUnknown: "upf.onboardedPlugin.adapter.unknown",
  onboardedPluginDuplicate: "upf.onboardedPlugin.duplicate",
} as const;

/** An outside plugin the framework depends on, and the workflow adapter it serves. */
export interface OnboardedPlugin {
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly adapter: string;
}

export interface OnboardedPluginsRead {
  readonly plugins: readonly OnboardedPlugin[];
  readonly diagnostics: readonly Diagnostic[];
}

type Field = keyof OnboardedPlugin;

const FIELDS: readonly Field[] = ["name", "version", "source", "adapter"];

const NONE: OnboardedPluginsRead = { plugins: [], diagnostics: [] };

const SECTION_PATH = `extensions["${UPF_EXTENSION}"]`;

const entryPath = (index: number, field?: Field): string =>
  `${SECTION_PATH}.onboardedPlugins[${index}]${field === undefined ? "" : `.${field}`}`;

const error = (code: string, message: string, path: string): Diagnostic => ({
  severity: "error",
  code,
  message,
  path,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const missingFields = (entry: Record<string, unknown>, index: number): readonly Diagnostic[] =>
  FIELDS.flatMap((field) =>
    nonEmptyString(entry[field]) === undefined
      ? [
          error(
            onboardedDiagnosticCodes.onboardedPluginFieldRequired,
            `Onboarded plugin ${index} needs a non-empty "${field}".`,
            entryPath(index, field),
          ),
        ]
      : [],
  );

const toPlugin = (entry: Record<string, unknown>): OnboardedPlugin => ({
  name: nonEmptyString(entry["name"]) ?? "",
  version: nonEmptyString(entry["version"]) ?? "",
  source: nonEmptyString(entry["source"]) ?? "",
  adapter: nonEmptyString(entry["adapter"]) ?? "",
});

const unknownAdapter = (plugin: OnboardedPlugin, index: number): readonly Diagnostic[] =>
  WORKFLOW_ADAPTERS.has(plugin.adapter)
    ? []
    : [
        error(
          onboardedDiagnosticCodes.onboardedPluginAdapterUnknown,
          `Onboarded plugin "${plugin.name}" names unknown workflow adapter "${plugin.adapter}"; known adapters: ${[
            ...WORKFLOW_ADAPTERS,
          ].join(", ")}.`,
          entryPath(index, "adapter"),
        ),
      ];

const readEntry = (value: unknown, index: number): OnboardedPluginsRead => {
  if (!isRecord(value)) {
    return {
      plugins: [],
      diagnostics: [
        error(
          onboardedDiagnosticCodes.onboardedPluginInvalidType,
          `Onboarded plugin ${index} must be an object.`,
          entryPath(index),
        ),
      ],
    };
  }
  const missing = missingFields(value, index);
  if (missing.length > 0) return { plugins: [], diagnostics: missing };
  const plugin = toPlugin(value);
  const adapter = unknownAdapter(plugin, index);
  return adapter.length > 0 ? { plugins: [], diagnostics: adapter } : { plugins: [plugin], diagnostics: [] };
};

const duplicate = (plugin: OnboardedPlugin, index: number): Diagnostic =>
  error(
    onboardedDiagnosticCodes.onboardedPluginDuplicate,
    `Onboarded plugin "${plugin.name}" is declared more than once.`,
    entryPath(index, "name"),
  );

/** Adds one entry's result, keeping the first declaration of each plugin name. */
const appendEntry = (read: OnboardedPluginsRead, value: unknown, index: number): OnboardedPluginsRead => {
  const entry = readEntry(value, index);
  const repeated = entry.plugins.filter((plugin) => read.plugins.some(({ name }) => name === plugin.name));
  return repeated.length > 0
    ? { plugins: read.plugins, diagnostics: [...read.diagnostics, ...repeated.map((plugin) => duplicate(plugin, index))] }
    : { plugins: [...read.plugins, ...entry.plugins], diagnostics: [...read.diagnostics, ...entry.diagnostics] };
};

/** Reads the onboarded plugin declarations from a manifest's `extensions`. Pure: no I/O. */
export const readOnboardedPlugins = (extensions: Record<string, unknown> | undefined): OnboardedPluginsRead => {
  const section = extensions?.[UPF_EXTENSION];
  if (section === undefined) return NONE;
  const declared = isRecord(section) ? section["onboardedPlugins"] : undefined;
  return Array.isArray(declared)
    ? declared.reduce<OnboardedPluginsRead>(appendEntry, NONE)
    : {
        plugins: [],
        diagnostics: [
          error(
            onboardedDiagnosticCodes.upfExtensionInvalid,
            `Extension "${UPF_EXTENSION}" must be an object with an "onboardedPlugins" array.`,
            SECTION_PATH,
          ),
        ],
      };
};

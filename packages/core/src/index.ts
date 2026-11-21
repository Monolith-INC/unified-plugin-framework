import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { isPluginAuthor, type PluginAuthor } from "./author.js";
import { onboardedDiagnosticCodes, readOnboardedPlugins, type OnboardedPlugin } from "./onboarded.js";

export { isPluginAuthor, type PluginAuthor } from "./author.js";

export {
  UPF_EXTENSION,
  WORKFLOW_ADAPTERS,
  WORKFLOW_NAMES,
  readOnboardedPlugins,
  declaredWorkflows,
  type OnboardedPlugin,
  type OnboardedPluginsRead,
  type WorkflowName,
} from "./onboarded.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export const diagnosticCodes = {
  manifestInvalidType: "manifest.invalid_type",
  manifestSchemaRequired: "manifest.schema.required",
  manifestSchemaUnsupported: "manifest.schema.unsupported",
  manifestSchemaLegacy: "manifest.schema.legacy",
  manifestNameRequired: "manifest.name.required",
  manifestNameInvalid: "manifest.name.invalid",
  manifestNameLegacyScope: "manifest.name.legacy_scope",
  manifestVersionInvalidType: "manifest.version.invalid_type",
  manifestDescriptionInvalidType: "manifest.description.invalid_type",
  manifestAuthorInvalid: "manifest.author.invalid",
  manifestHomepageInvalidType: "manifest.homepage.invalid_type",
  manifestRepositoryInvalidType: "manifest.repository.invalid_type",
  manifestLicenseInvalidType: "manifest.license.invalid_type",
  manifestKeywordsInvalidType: "manifest.keywords.invalid_type",
  manifestExtensionsInvalidType: "manifest.extensions.invalid_type",
  manifestExtensionLegacyNamespace: "manifest.extensions.legacy_namespace",
  manifestSchemaVersionInvalidType: "manifest.schemaVersion.invalid_type",
  manifestSchemaVersionUnsupported: "manifest.schemaVersion.unsupported",
  manifestUnknownField: "manifest.unknown_field",
  manifestInlineComponentsLegacy: "manifest.inline_components.legacy",
  skillsInvalidType: "skills.invalid_type",
  skillInvalidType: "skill.invalid_type",
  skillNameRequired: "skill.name.required",
  skillPathRequired: "skill.path.required",
  skillDescriptionInvalidType: "skill.description.invalid_type",
  mcpSchemaInvalid: "mcp.schema.invalid",
  mcpLegacyFormat: "mcp.format.legacy",
  mcpServersInvalidType: "mcpServers.invalid_type",
  mcpServerInvalidType: "mcpServer.invalid_type",
  mcpServerNameRequired: "mcpServer.name.required",
  mcpServerCommandRequired: "mcpServer.command.required",
  mcpServerCommandInvalid: "mcpServer.command.invalid",
  mcpServerUrlRequired: "mcpServer.url.required",
  mcpServerUrlInvalid: "mcpServer.url.invalid",
  mcpServerPathRequired: "mcpServer.path.required",
  mcpServerTransportUnsupported: "mcpServer.transport.unsupported",
  mcpServerTransportRequired: "mcpServer.transport.required",
  mcpServerArgsInvalidType: "mcpServer.args.invalid_type",
  mcpServerArgInvalidType: "mcpServer.args.item.invalid_type",
  mcpServerEnvInvalidType: "mcpServer.env.invalid_type",
  mcpServerEnvReservedKey: "mcpServer.env.reserved_key",
  mcpServerHeadersInvalidType: "mcpServer.headers.invalid_type",
  mcpServerHeaderDuplicate: "mcpServer.headers.duplicate",
  mcpServerCwdInvalidType: "mcpServer.cwd.invalid_type",
  mcpServerCwdInvalid: "mcpServer.cwd.invalid",
  manifestUnreadable: "manifest.unreadable",
  skillMissingSkillMd: "skill.missing_skill_md",
  pathEscape: "path.escape",
  authoringNameInvalid: "authoring.name.invalid",
  authoringDestinationExists: "authoring.destination.exists",
  authoringDestinationUnsafe: "authoring.destination.unsafe",
  authoringPluginRootInvalid: "authoring.plugin_root.invalid",
  authoringSkillExists: "authoring.skill.exists",
  authoringWriteFailed: "authoring.write_failed",
  ...onboardedDiagnosticCodes,
} as const;

export type DiagnosticCode = (typeof diagnosticCodes)[keyof typeof diagnosticCodes] | (string & {});

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export interface PluginManifest {
  readonly $schema?: string;
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly author?: PluginAuthor;
  readonly homepage?: string;
  readonly repository?: string;
  /** An SPDX license identifier, such as `Apache-2.0`. */
  readonly license?: string;
  readonly keywords?: readonly string[];
  readonly schemaVersion?: string;
  readonly extensions?: Record<string, unknown>;
}

export const SUPPORTED_SCHEMA_VERSION = "1.0.0";
export const PLUGIN_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" as const;
export const MCP_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json" as const;
export const LEGACY_DISTRIBUTION_EXTENSION = "org.agent-plugins.distribution" as const;
export const UPF_DISTRIBUTION_EXTENSION = "io.github.monolith-inc.upf.distribution" as const;
/** Every host registers the project knowledge server under this one name, so workflows and review settings can refer to it. */
export const KNOWLEDGE_SERVER = "project-knowledge" as const;

const PORTABLE_MANIFEST_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "schemaVersion",
  "extensions",
]);

const DECLARATION_MANIFEST_FIELDS = new Set([...PORTABLE_MANIFEST_FIELDS, "skills", "mcpServers"]);

const SPEC_PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const LEGACY_SCOPED_NAME_PATTERN = /^@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SKILL_DIRECTORY_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CWD_PATTERN = /^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/;
const RESERVED_ENV_KEYS: ReadonlySet<string> = new Set(["PLUGIN_ROOT", "PLUGIN_DATA"]);

export interface AuthoringResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly path?: string;
  readonly name?: string;
  readonly nextSteps?: readonly string[];
}

export function isSpecPluginName(name: string): boolean {
  return name.length >= 1 && name.length <= 64 && SPEC_PLUGIN_NAME_PATTERN.test(name);
}

export function isValidPluginName(name: string): boolean {
  return isSpecPluginName(name);
}

export function isValidSkillDirectoryName(name: string): boolean {
  return SKILL_DIRECTORY_NAME_PATTERN.test(name);
}

export function pluginDirectoryName(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

export function buildPluginManifestJson(name: string): string {
  return `${JSON.stringify(
    {
      $schema: PLUGIN_SCHEMA_URL,
      name,
      version: "0.1.0",
      description: "Scaffolded by agent-plugin create.",
    },
    null,
    2,
  )}\n`;
}

export function buildSkillMarkdown(skillName: string): string {
  return [
    "---",
    `name: ${skillName}`,
    `description: Use when working with the ${skillName} skill.`,
    "---",
    "",
    `# ${titleCaseSkill(skillName)}`,
    "",
    `Describe how to use the ${skillName} skill.`,
    "",
  ].join("\n");
}

export function createPluginScaffold(options: {
  readonly name: string;
  readonly destination: string;
  readonly rawDestination?: string;
}): AuthoringResult {
  const nameCheck = validateAuthoringPluginName(options.name);
  if (nameCheck !== undefined) return { diagnostics: [nameCheck] };

  const unsafe = unsafePathDiagnostic(options.rawDestination ?? options.destination);
  if (unsafe !== undefined) return { diagnostics: [unsafe] };

  const destination = resolve(options.destination);
  const destinationCheck = checkCreateDestination(destination);
  if (destinationCheck !== undefined) return { diagnostics: [destinationCheck] };

  return writeCreateScaffold({
    name: options.name,
    destination,
    createdRoot: !existsSync(destination),
  });
}

export function addSkillScaffold(options: {
  readonly skillName: string;
  readonly pluginRoot: string;
  readonly rawPluginRoot?: string;
}): AuthoringResult {
  const nameCheck = validateAuthoringSkillName(options.skillName);
  if (nameCheck !== undefined) return { diagnostics: [nameCheck] };

  const unsafe = unsafePathDiagnostic(options.rawPluginRoot ?? options.pluginRoot);
  if (unsafe !== undefined) return { diagnostics: [unsafe] };

  const pluginRoot = resolve(options.pluginRoot);
  const rootCheck = checkAuthoringPluginRoot(pluginRoot);
  if (rootCheck !== undefined) return { diagnostics: [rootCheck] };

  const skillDir = join(pluginRoot, "skills", options.skillName);
  const skillPath = join(skillDir, "SKILL.md");
  if (existsSync(skillDir) || existsSync(skillPath)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.authoringSkillExists,
          message: `Skill already exists at skills/${options.skillName}.`,
          path: `skills/${options.skillName}`,
        }),
      ],
    };
  }

  return writeSkillScaffold({
    skillName: options.skillName,
    skillDir,
    skillPath,
  });
}

export interface PluginSkill {
  readonly name?: string;
  readonly path: string;
  readonly description?: string;
}

export type PluginPlaceholder = "PLUGIN_ROOT" | "PLUGIN_DATA";

export type PluginMcpTransport = "stdio" | "streamable-http" | "sse" | "config-path";

export type PluginMcpServer =
  | {
      readonly transport: "stdio";
      readonly name?: string;
      readonly command: string;
      readonly args?: readonly string[];
      readonly env?: Readonly<Record<string, string>>;
      readonly cwd?: string;
      readonly placeholders?: readonly PluginPlaceholder[];
    }
  | {
      readonly transport: "streamable-http";
      readonly name?: string;
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly placeholders?: readonly PluginPlaceholder[];
    }
  | {
      readonly transport: "sse";
      readonly name?: string;
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly placeholders?: readonly PluginPlaceholder[];
    }
  | {
      readonly transport: "config-path";
      readonly name?: string;
      readonly path: string;
      readonly placeholders?: readonly PluginPlaceholder[];
    };

export interface PluginInspection {
  readonly manifest?: PluginManifest;
  readonly skills?: readonly PluginSkill[];
  readonly mcpServers?: readonly PluginMcpServer[];
  readonly onboardedPlugins?: readonly OnboardedPlugin[];
  readonly diagnostics: readonly Diagnostic[];
}

type ReadResult<T> = {
  readonly value?: T;
  readonly diagnostics: readonly Diagnostic[];
};

export function createDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return diagnostic;
}

export function inspectManifest(value: unknown): PluginInspection {
  if (!isRecord(value)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.manifestInvalidType,
          message: "Plugin manifest must be a JSON object.",
        }),
      ],
    };
  }

  const manifest = readManifest(value, "portable");
  const onboarded = readOnboardedPlugins(manifest.value?.extensions);
  return {
    ...(manifest.value === undefined ? {} : { manifest: manifest.value }),
    ...optionalOnboardedPlugins(onboarded.plugins),
    diagnostics: [...manifest.diagnostics, ...onboarded.diagnostics],
  };
}

export function inspectPlugin(value: unknown): PluginInspection {
  if (!isRecord(value)) {
    return inspectManifest(value);
  }

  const manifest = readManifest(value, "declaration");
  const inlineWarnings: readonly Diagnostic[] =
    value["mcpServers"] === undefined
      ? []
      : [
          createDiagnostic({
            severity: "warning",
            code: diagnosticCodes.manifestInlineComponentsLegacy,
            message:
              'Inline "mcpServers" in plugin.json is legacy. Move MCP server declarations to root "mcp.json".',
            path: "mcpServers",
          }),
        ];
  const skills = readSkills(value["skills"]);
  const mcpServers = readMcpServers(value["mcpServers"]);
  const onboarded = readOnboardedPlugins(manifest.value?.extensions);

  return {
    ...(manifest.value === undefined ? {} : { manifest: manifest.value }),
    ...optionalSkills(skills.value),
    ...optionalMcpServers(mcpServers.value),
    ...optionalOnboardedPlugins(onboarded.plugins),
    diagnostics: [
      ...manifest.diagnostics,
      ...inlineWarnings,
      ...skills.diagnostics,
      ...mcpServers.diagnostics,
      ...onboarded.diagnostics,
    ],
  };
}

function optionalOnboardedPlugins(
  value: readonly OnboardedPlugin[],
): { readonly onboardedPlugins?: readonly OnboardedPlugin[] } {
  return value.length === 0 ? {} : { onboardedPlugins: value };
}

function readManifest(
  value: Record<string, unknown>,
  mode: "portable" | "declaration",
): ReadResult<PluginManifest> {
  const allowed = mode === "portable" ? PORTABLE_MANIFEST_FIELDS : DECLARATION_MANIFEST_FIELDS;
  const unknownFields = Object.keys(value)
    .filter((key) => !allowed.has(key))
    .reduce<readonly string[]>(insertSorted, [])
    .map((key) =>
      createDiagnostic({
        severity: "warning",
        code: diagnosticCodes.manifestUnknownField,
        message: `Unknown top-level manifest field "${key}" was ignored. Move client-specific data under "extensions".`,
        path: key,
      }),
    );

  const schema = readManifestSchema(value);
  const name = readPluginName(value);
  const version = readOptionalString(value, "version", diagnosticCodes.manifestVersionInvalidType);
  const description = readOptionalString(value, "description", diagnosticCodes.manifestDescriptionInvalidType);
  const author = readAuthor(value);
  const homepage = readOptionalString(value, "homepage", diagnosticCodes.manifestHomepageInvalidType);
  const repository = readOptionalString(value, "repository", diagnosticCodes.manifestRepositoryInvalidType);
  const license = readOptionalString(value, "license", diagnosticCodes.manifestLicenseInvalidType);
  const keywords = readOptionalManifestStringArray(value, "keywords", diagnosticCodes.manifestKeywordsInvalidType);
  const schemaVersion = readSchemaVersion(value, schema.value !== undefined);
  const extensions = readExtensions(value);
  const diagnostics = [
    ...unknownFields,
    ...schema.diagnostics,
    ...name.diagnostics,
    ...version.diagnostics,
    ...description.diagnostics,
    ...author.diagnostics,
    ...homepage.diagnostics,
    ...repository.diagnostics,
    ...license.diagnostics,
    ...keywords.diagnostics,
    ...schemaVersion.diagnostics,
    ...extensions.diagnostics,
  ];
  const blocked = diagnostics.some((diagnostic) => isManifestRejection(diagnostic.code));

  return name.value === undefined || blocked
    ? { diagnostics }
    : {
        value: {
          ...(schema.value === undefined ? {} : { $schema: schema.value }),
          name: name.value,
          ...(version.value === undefined ? {} : { version: version.value }),
          ...(description.value === undefined ? {} : { description: description.value }),
          ...(author.value === undefined ? {} : { author: author.value }),
          ...(homepage.value === undefined ? {} : { homepage: homepage.value }),
          ...(repository.value === undefined ? {} : { repository: repository.value }),
          ...(license.value === undefined ? {} : { license: license.value }),
          ...(keywords.value === undefined ? {} : { keywords: keywords.value }),
          ...(schemaVersion.value === undefined ? {} : { schemaVersion: schemaVersion.value }),
          ...(extensions.value === undefined ? {} : { extensions: extensions.value }),
        },
        diagnostics,
      };
}

function isManifestRejection(code: DiagnosticCode): boolean {
  switch (code) {
    case diagnosticCodes.manifestSchemaRequired:
    case diagnosticCodes.manifestSchemaUnsupported:
    case diagnosticCodes.manifestSchemaVersionUnsupported:
    case diagnosticCodes.manifestSchemaVersionInvalidType:
    case diagnosticCodes.manifestNameInvalid:
    case diagnosticCodes.manifestVersionInvalidType:
    case diagnosticCodes.manifestDescriptionInvalidType:
    case diagnosticCodes.manifestAuthorInvalid:
    case diagnosticCodes.manifestHomepageInvalidType:
    case diagnosticCodes.manifestRepositoryInvalidType:
    case diagnosticCodes.manifestLicenseInvalidType:
    case diagnosticCodes.manifestKeywordsInvalidType:
      return true;
    default:
      return false;
  }
}

function readManifestSchema(value: Record<string, unknown>): ReadResult<string> {
  const entry = value["$schema"];
  if (entry === PLUGIN_SCHEMA_URL) return { value: entry, diagnostics: [] };
  if (entry !== undefined) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.manifestSchemaUnsupported,
          message: `Unsupported manifest "$schema" ${JSON.stringify(entry)}. Supported: "${PLUGIN_SCHEMA_URL}".`,
          path: "$schema",
        }),
      ],
    };
  }
  if (value["schemaVersion"] === SUPPORTED_SCHEMA_VERSION) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "warning",
          code: diagnosticCodes.manifestSchemaLegacy,
          message: `Manifest uses legacy "schemaVersion": "${SUPPORTED_SCHEMA_VERSION}" without "$schema". Set "$schema": "${PLUGIN_SCHEMA_URL}" and remove "schemaVersion".`,
          path: "schemaVersion",
        }),
      ],
    };
  }
  if (value["schemaVersion"] !== undefined) {
    return { diagnostics: [] };
  }
  return {
    diagnostics: [
      createDiagnostic({
        severity: "error",
        code: diagnosticCodes.manifestSchemaRequired,
        message: `Manifest requires "$schema": "${PLUGIN_SCHEMA_URL}".`,
        path: "$schema",
      }),
    ],
  };
}

function readPluginName(value: Record<string, unknown>): ReadResult<string> {
  const required = readRequiredString(value, "name", diagnosticCodes.manifestNameRequired);
  if (required.value === undefined) return required;
  if (isSpecPluginName(required.value)) return required;
  if (LEGACY_SCOPED_NAME_PATTERN.test(required.value)) {
    return {
      value: required.value,
      diagnostics: [
        ...required.diagnostics,
        createDiagnostic({
          severity: "warning",
          code: diagnosticCodes.manifestNameLegacyScope,
          message:
            'Scoped plugin name "@scope/name" is legacy. Agent Plugins v1.0.0 names are 1-64 lowercase characters (a-z, 0-9, "-", ".") starting and ending with a letter or digit, with no "--" or "..".',
          path: "name",
        }),
      ],
    };
  }
  return {
    diagnostics: [
      ...required.diagnostics,
      createDiagnostic({
        severity: "error",
        code: diagnosticCodes.manifestNameInvalid,
        message:
          'Manifest field "name" must be 1-64 lowercase characters (a-z, 0-9, "-", "."), starting and ending with a letter or digit, with no "--" or "..".',
        path: "name",
      }),
    ],
  };
}

function readSchemaVersion(value: Record<string, unknown>, hasSchema: boolean): ReadResult<string> {
  const entry = value["schemaVersion"];
  if (entry === undefined) return { diagnostics: [] };
  if (typeof entry !== "string" || entry.length === 0) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.manifestSchemaVersionInvalidType,
          message: 'Manifest field "schemaVersion" must be a non-empty string when present.',
          path: "schemaVersion",
        }),
      ],
    };
  }
  if (entry !== SUPPORTED_SCHEMA_VERSION) {
    return {
      value: entry,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.manifestSchemaVersionUnsupported,
          message: `Unsupported schemaVersion "${entry}". Supported: ${SUPPORTED_SCHEMA_VERSION} (prefer "$schema": "${PLUGIN_SCHEMA_URL}").`,
          path: "schemaVersion",
        }),
      ],
    };
  }
  return {
    value: entry,
    diagnostics: hasSchema
      ? [
          createDiagnostic({
            severity: "warning",
            code: diagnosticCodes.manifestSchemaLegacy,
            message: `Manifest field "schemaVersion" is legacy and redundant when "$schema" is set. Remove "schemaVersion".`,
            path: "schemaVersion",
          }),
        ]
      : [],
  };
}

function readExtensions(value: Record<string, unknown>): ReadResult<Record<string, unknown>> {
  const entry = value["extensions"];
  if (entry === undefined) return { diagnostics: [] };
  if (!isRecord(entry)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "warning",
          code: diagnosticCodes.manifestExtensionsInvalidType,
          message: 'Field "extensions" must be an object when present; ignoring non-object extensions.',
          path: "extensions",
        }),
      ],
    };
  }
  const legacyWarning: readonly Diagnostic[] =
    entry[LEGACY_DISTRIBUTION_EXTENSION] !== undefined
      ? [
          createDiagnostic({
            severity: "warning",
            code: diagnosticCodes.manifestExtensionLegacyNamespace,
            message: `Extension namespace "${LEGACY_DISTRIBUTION_EXTENSION}" is legacy. Move distribution settings to "${UPF_DISTRIBUTION_EXTENSION}".`,
            path: `extensions.${LEGACY_DISTRIBUTION_EXTENSION}`,
          }),
        ]
      : [];
  return { value: entry, diagnostics: legacyWarning };
}

function readOptionalManifestStringArray(
  value: Record<string, unknown>,
  key: string,
  code: DiagnosticCode,
): ReadResult<readonly string[]> {
  const entry = value[key];
  if (entry === undefined) return { diagnostics: [] };
  return Array.isArray(entry) && entry.every((item) => typeof item === "string")
    ? { value: entry, diagnostics: [] }
    : {
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code,
            message: `Field "${key}" must be an array of strings when present.`,
            path: key,
          }),
        ],
      };
}

function readSkills(value: unknown): ReadResult<readonly PluginSkill[]> {
  if (value === undefined) return { diagnostics: [] };
  if (typeof value === "string" && value.length > 0) {
    return { value: [{ path: value }], diagnostics: [] };
  }
  if (!Array.isArray(value)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.skillsInvalidType,
          message: 'Plugin field "skills" must be a path string or an array when present.',
          path: "skills",
        }),
      ],
    };
  }

  return value.reduce<ReadResult<readonly PluginSkill[]>>(
    (acc, entry, index) => {
      const path = `skills[${index}]`;
      if (!isRecord(entry)) {
        return {
          value: acc.value ?? [],
          diagnostics: [
            ...acc.diagnostics,
            createDiagnostic({
              severity: "error",
              code: diagnosticCodes.skillInvalidType,
              message: "Skill entry must be an object.",
              path,
            }),
          ],
        };
      }

      const name = readRequiredString(entry, "name", diagnosticCodes.skillNameRequired, path);
      const skillPath = readRequiredString(entry, "path", diagnosticCodes.skillPathRequired, path);
      const description = readOptionalString(
        entry,
        "description",
        diagnosticCodes.skillDescriptionInvalidType,
        path,
      );
      const diagnostics = [...acc.diagnostics, ...name.diagnostics, ...skillPath.diagnostics, ...description.diagnostics];

      return name.value === undefined || skillPath.value === undefined
        ? { value: acc.value ?? [], diagnostics }
        : {
            value: [
              ...(acc.value ?? []),
              {
                name: name.value,
                path: skillPath.value,
                ...(description.value === undefined ? {} : { description: description.value }),
              },
            ],
            diagnostics,
          };
    },
    { value: [], diagnostics: [] },
  );
}

function readMcpServers(value: unknown): ReadResult<readonly PluginMcpServer[]> {
  if (value === undefined) return { diagnostics: [] };
  if (typeof value === "string" && value.length > 0) {
    return {
      value: [configPathServer(undefined, value)],
      diagnostics: [legacyMcpFormatDiagnostic("mcpServers", 'MCP "config-path" string is legacy; declare servers in root "mcp.json".')],
    };
  }
  if (isRecord(value)) {
    return readMcpServerMap(value);
  }
  if (!Array.isArray(value)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpServersInvalidType,
          message: 'Plugin field "mcpServers" must be a path string, object map, or array when present.',
          path: "mcpServers",
        }),
      ],
    };
  }

  return value.reduce<ReadResult<readonly PluginMcpServer[]>>(
    (acc, entry, index) => {
      const path = `mcpServers[${index}]`;
      if (!isRecord(entry)) {
        return {
          value: acc.value ?? [],
          diagnostics: [
            ...acc.diagnostics,
            createDiagnostic({
              severity: "error",
              code: diagnosticCodes.mcpServerInvalidType,
              message: "MCP server entry must be an object.",
              path,
            }),
          ],
        };
      }

      const name = readRequiredString(entry, "name", diagnosticCodes.mcpServerNameRequired, path);
      const parsed = readMcpServerRecord(entry, path, name.value);
      const diagnostics = [...acc.diagnostics, ...name.diagnostics, ...parsed.diagnostics];
      return name.value === undefined || parsed.value === undefined
        ? { value: acc.value ?? [], diagnostics }
        : {
            value: [...(acc.value ?? []), parsed.value],
            diagnostics,
          };
    },
    { value: [], diagnostics: [] },
  );
}

function readMcpServerMap(value: Record<string, unknown>): ReadResult<readonly PluginMcpServer[]> {
  return Object.entries(value).reduce<ReadResult<readonly PluginMcpServer[]>>(
    (acc, [name, entry]) => {
      const path = `mcpServers.${name}`;
      if (typeof entry === "string" && entry.length > 0) {
        return {
          value: [...(acc.value ?? []), configPathServer(name, entry)],
          diagnostics: [
            ...acc.diagnostics,
            legacyMcpFormatDiagnostic(path, 'MCP "config-path" string entry is legacy; declare explicit "type": "stdio" | "streamable-http" | "sse" in root "mcp.json".'),
          ],
        };
      }

      if (!isRecord(entry)) {
        return {
          value: acc.value ?? [],
          diagnostics: [
            ...acc.diagnostics,
            createDiagnostic({
              severity: "error",
              code: diagnosticCodes.mcpServerInvalidType,
              message: "MCP server entry must be an object or path string.",
              path,
            }),
          ],
        };
      }

      const parsed = readMcpServerRecord(entry, path, name);
      return {
        value: [...(acc.value ?? []), ...(parsed.value === undefined ? [] : [parsed.value])],
        diagnostics: [...acc.diagnostics, ...parsed.diagnostics],
      };
    },
    { value: [], diagnostics: [] },
  );
}

function readMcpServerRecord(
  entry: Record<string, unknown>,
  path: string,
  name: string | undefined,
): ReadResult<PluginMcpServer> {
  const transport = readDeclaredTransport(entry, path);
  if (transport.diagnostics.some((d) => d.severity === "error") && transport.value === undefined) {
    return { diagnostics: transport.diagnostics };
  }

  switch (transport.value) {
    case "stdio":
      return readStdioServer(entry, path, name, transport.diagnostics);
    case "streamable-http":
    case "sse":
      return readHttpServer(entry, path, name, transport.value, transport.diagnostics);
    case "config-path": {
      const configPath = readRequiredString(entry, "path", diagnosticCodes.mcpServerPathRequired, path);
      const legacy = legacyMcpFormatDiagnostic(
        path,
        'MCP transport "config-path" is legacy and not part of Agent Plugins v1.0.0. Declare servers directly in root "mcp.json".',
      );
      return configPath.value === undefined
        ? { diagnostics: [...transport.diagnostics, ...configPath.diagnostics] }
        : {
            value: configPathServer(name, configPath.value),
            diagnostics: [...transport.diagnostics, legacy, ...configPath.diagnostics],
          };
    }
    case undefined:
      return inferMcpServer(entry, path, name, transport.diagnostics);
    default:
      return { diagnostics: transport.diagnostics };
  }
}

function inferMcpServer(
  entry: Record<string, unknown>,
  path: string,
  name: string | undefined,
  prior: readonly Diagnostic[],
): ReadResult<PluginMcpServer> {
  const hasCommand = entry["command"] !== undefined;
  const hasUrl = entry["url"] !== undefined;
  switch (true) {
    case hasCommand && hasUrl:
      return {
        diagnostics: [
          ...prior,
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerTransportRequired,
            message:
              'MCP server with both "command" and "url" must declare transport via "type".',
            path: formatPath(path, "type"),
          }),
        ],
      };
    case hasCommand:
      return readStdioServer(entry, path, name, [
        ...prior,
        legacyMcpFormatDiagnostic(
          formatPath(path, "type"),
          'MCP server omits "type". Add "type": "stdio" for Agent Plugins v1.0.0 compliance.',
        ),
      ]);
    case hasUrl:
      return {
        diagnostics: [
          ...prior,
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerTransportRequired,
            message:
              'MCP server with "url" must declare transport "streamable-http" or "sse" via "type".',
            path: formatPath(path, "type"),
          }),
        ],
      };
    default:
      return readStdioServer(entry, path, name, prior);
  }
}

function readDeclaredTransport(
  entry: Record<string, unknown>,
  path: string,
): ReadResult<PluginMcpTransport> {
  const typed = entry["type"];
  const transported = entry["transport"];
  switch (true) {
    case typed !== undefined && transported !== undefined && typed !== transported:
      return {
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerTransportUnsupported,
            message: 'MCP server "type" and "transport" must agree when both are present.',
            path: formatPath(path, "transport"),
          }),
        ],
      };
    default: {
      const field = typed !== undefined ? "type" : "transport";
      const result = readTransportValue(typed ?? transported, path, field);
      return field === "transport" && result.value !== undefined
        ? {
            value: result.value,
            diagnostics: [
              ...result.diagnostics,
              legacyMcpFormatDiagnostic(
                formatPath(path, "transport"),
                'MCP server uses legacy field "transport". Use "type" for Agent Plugins v1.0.0 compliance.',
              ),
            ],
          }
        : result;
    }
  }
}

function readTransportValue(
  raw: unknown,
  path: string,
  field: "type" | "transport",
): ReadResult<PluginMcpTransport> {
  if (raw === undefined) return { diagnostics: [] };
  switch (raw) {
    case "stdio":
      return { value: "stdio", diagnostics: [] };
    case "streamable-http":
      return { value: "streamable-http", diagnostics: [] };
    case "sse":
      return { value: "sse", diagnostics: [] };
    case "config-path":
      return { value: "config-path", diagnostics: [] };
    default:
      return {
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerTransportUnsupported,
            message:
              'MCP server transport must be one of "stdio", "streamable-http", or "sse".',
            path: formatPath(path, field),
          }),
        ],
      };
  }
}

function readStdioServer(
  entry: Record<string, unknown>,
  path: string,
  name: string | undefined,
  prior: readonly Diagnostic[],
): ReadResult<PluginMcpServer> {
  const command = readRequiredString(entry, "command", diagnosticCodes.mcpServerCommandRequired, path);
  const commandPlaceholderDiag: readonly Diagnostic[] =
    command.value !== undefined && PLACEHOLDER_PATTERN.test(command.value)
      ? [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerCommandInvalid,
            message: 'MCP stdio "command" must not contain plugin variable placeholders.',
            path: formatPath(path, "command"),
          }),
        ]
      : [];
  PLACEHOLDER_PATTERN.lastIndex = 0;
  const args = readOptionalStringArray(entry, "args", path);
  const env = readStdioEnv(entry, path);
  const cwd = readStdioCwd(entry, path);
  const diagnostics = [
    ...prior,
    ...command.diagnostics,
    ...commandPlaceholderDiag,
    ...args.diagnostics,
    ...env.diagnostics,
    ...cwd.diagnostics,
  ];
  const hasError = diagnostics.some((d) => d.severity === "error");
  return command.value === undefined || hasError
    ? { diagnostics }
    : {
        value: withPlaceholders({
          transport: "stdio",
          ...(name === undefined ? {} : { name }),
          command: command.value,
          ...(args.value === undefined ? {} : { args: args.value }),
          ...(env.value === undefined ? {} : { env: env.value }),
          ...(cwd.value === undefined ? {} : { cwd: cwd.value }),
        }),
        diagnostics,
      };
}

function readStdioEnv(
  entry: Record<string, unknown>,
  parentPath: string,
): ReadResult<Readonly<Record<string, string>>> {
  const raw = entry["env"];
  if (raw === undefined) return { diagnostics: [] };
  const path = formatPath(parentPath, "env");
  if (!isRecord(raw)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpServerEnvInvalidType,
          message: 'Field "env" must be an object of string values when present.',
          path,
        }),
      ],
    };
  }
  const diagnostics = Object.entries(raw).flatMap(([k, v]): readonly Diagnostic[] => [
    ...(RESERVED_ENV_KEYS.has(k)
      ? [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerEnvReservedKey,
            message: `MCP stdio "env" must not declare reserved variable "${k}".`,
            path: formatPath(path, k),
          }),
        ]
      : []),
    ...(typeof v !== "string"
      ? [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerEnvInvalidType,
            message: `MCP stdio "env.${k}" must be a string.`,
            path: formatPath(path, k),
          }),
        ]
      : []),
  ]);
  return diagnostics.length > 0 ? { diagnostics } : { value: raw as Readonly<Record<string, string>>, diagnostics: [] };
}

function readStdioCwd(entry: Record<string, unknown>, parentPath: string): ReadResult<string> {
  const cwd = readOptionalString(entry, "cwd", diagnosticCodes.mcpServerCwdInvalidType, parentPath);
  if (cwd.value === undefined) return cwd;
  return CWD_PATTERN.test(cwd.value)
    ? cwd
    : {
        diagnostics: [
          ...cwd.diagnostics,
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerCwdInvalid,
            message: 'MCP stdio "cwd" must start with "./", "${PLUGIN_ROOT}", or "${PLUGIN_DATA}".',
            path: formatPath(parentPath, "cwd"),
          }),
        ],
      };
}

function readHttpServer(
  entry: Record<string, unknown>,
  path: string,
  name: string | undefined,
  transport: "streamable-http" | "sse",
  prior: readonly Diagnostic[],
): ReadResult<PluginMcpServer> {
  const url = readRequiredString(entry, "url", diagnosticCodes.mcpServerUrlRequired, path);
  const urlValidation = url.value === undefined ? [] : validateRemoteUrl(url.value, formatPath(path, "url"));
  const headers = readRemoteHeaders(entry, path);
  const diagnostics = [...prior, ...url.diagnostics, ...urlValidation, ...headers.diagnostics];
  const hasError = diagnostics.some((d) => d.severity === "error");
  return url.value === undefined || hasError
    ? { diagnostics }
    : {
        value: {
          transport,
          ...(name === undefined ? {} : { name }),
          url: url.value,
          ...(headers.value === undefined ? {} : { headers: headers.value }),
        },
        diagnostics,
      };
}

function validateRemoteUrl(rawUrl: string, path: string): readonly Diagnostic[] {
  try {
    const parsed = new URL(rawUrl);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    const hasUserinfo = parsed.username.length > 0 || parsed.password.length > 0;
    const hasFragment = parsed.hash.length > 0;
    const nonLoopbackHttp = parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname);
    return !isHttp || hasUserinfo || hasFragment || nonLoopbackHttp
      ? [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerUrlInvalid,
            message:
              'MCP remote "url" must be an absolute HTTPS URL (or HTTP for localhost/loopback) without userinfo or fragment.',
            path,
          }),
        ]
      : [];
  } catch {
    return [
      createDiagnostic({
        severity: "error",
        code: diagnosticCodes.mcpServerUrlInvalid,
        message: 'MCP remote "url" must be a valid absolute HTTP or HTTPS URL.',
        path,
      }),
    ];
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function readRemoteHeaders(
  entry: Record<string, unknown>,
  parentPath: string,
): ReadResult<Readonly<Record<string, string>>> {
  const raw = entry["headers"];
  if (raw === undefined) return { diagnostics: [] };
  const path = formatPath(parentPath, "headers");
  if (!isRecord(raw)) {
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpServerHeadersInvalidType,
          message: 'Field "headers" must be an object of string values when present.',
          path,
        }),
      ],
    };
  }
  const seen = new Set<string>();
  const diagnostics = Object.entries(raw).flatMap(([k, v]): readonly Diagnostic[] => {
    const lower = k.toLowerCase();
    const dup = seen.has(lower)
      ? [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerHeaderDuplicate,
            message: `Duplicate case-insensitive HTTP header "${k}".`,
            path: formatPath(path, k),
          }),
        ]
      : [];
    seen.add(lower);
    const badVal =
      typeof v !== "string"
        ? [
            createDiagnostic({
              severity: "error",
              code: diagnosticCodes.mcpServerHeadersInvalidType,
              message: `Header "${k}" value must be a string.`,
              path: formatPath(path, k),
            }),
          ]
        : [];
    return [...dup, ...badVal];
  });
  return diagnostics.length > 0 ? { diagnostics } : { value: raw as Readonly<Record<string, string>>, diagnostics: [] };
}

function legacyMcpFormatDiagnostic(path: string, message: string): Diagnostic {
  return createDiagnostic({
    severity: "warning",
    code: diagnosticCodes.mcpLegacyFormat,
    message,
    path,
  });
}

function configPathServer(name: string | undefined, configPath: string): PluginMcpServer {
  return withPlaceholders({
    transport: "config-path",
    ...(name === undefined ? {} : { name }),
    path: configPath,
  });
}

function withPlaceholders<T extends PluginMcpServer>(server: T): T {
  const values = collectPlaceholderValues(server);
  const placeholders = collectPlaceholders(...values);
  return placeholders.length === 0 ? server : ({ ...server, placeholders } as T);
}

function collectPlaceholderValues(server: PluginMcpServer): readonly (string | undefined)[] {
  switch (server.transport) {
    case "stdio":
      return [server.cwd, ...(server.args ?? []), ...Object.values(server.env ?? {})];
    case "streamable-http":
    case "sse":
      return [];
    case "config-path":
      return [server.path];
  }
}

const PLACEHOLDER_PATTERN = /\$\{(PLUGIN_ROOT|PLUGIN_DATA)\}/g;

function collectPlaceholders(...values: readonly (string | undefined)[]): readonly PluginPlaceholder[] {
  return values
    .flatMap((value) => (value === undefined ? [] : [...value.matchAll(PLACEHOLDER_PATTERN)]))
    .map((match) => match[1] as PluginPlaceholder)
    .reduce<readonly PluginPlaceholder[]>(
      (acc, placeholder) => (acc.includes(placeholder) ? acc : insertSortedPlaceholder(acc, placeholder)),
      [],
    );
}

function insertSortedPlaceholder(
  items: readonly PluginPlaceholder[],
  item: PluginPlaceholder,
): readonly PluginPlaceholder[] {
  const index = items.findIndex((existing) => item.localeCompare(existing, "en") < 0);
  return index === -1 ? [...items, item] : [...items.slice(0, index), item, ...items.slice(index)];
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  code: DiagnosticCode,
  parentPath?: string,
): ReadResult<string> {
  const entry = value[key];
  return typeof entry === "string" && entry.length > 0
    ? { value: entry, diagnostics: [] }
    : {
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code,
            message: `Field "${key}" must be a non-empty string.`,
            path: formatPath(parentPath, key),
          }),
        ],
      };
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
  code: DiagnosticCode,
  parentPath?: string,
): ReadResult<string> {
  const entry = value[key];
  if (entry === undefined) return { diagnostics: [] };
  return typeof entry === "string"
    ? { value: entry, diagnostics: [] }
    : {
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code,
            message: `Field "${key}" must be a string when present.`,
            path: formatPath(parentPath, key),
          }),
        ],
      };
}

function readAuthor(value: Record<string, unknown>): ReadResult<PluginAuthor> {
  const entry = value["author"];
  return entry === undefined
    ? { diagnostics: [] }
    : isPluginAuthor(entry)
      ? { value: entry, diagnostics: [] }
      : {
          diagnostics: [
            createDiagnostic({
              severity: "error",
              code: diagnosticCodes.manifestAuthorInvalid,
              message: 'Field "author" must be an object with a non-empty "name" and optional string "email" and "url".',
              path: "author",
            }),
          ],
        };
}

function readOptionalRecord(
  value: Record<string, unknown>,
  key: string,
  code: DiagnosticCode,
  parentPath?: string,
): ReadResult<Record<string, unknown>> {
  const entry = value[key];
  if (entry === undefined) return { diagnostics: [] };
  return isRecord(entry)
    ? { value: entry, diagnostics: [] }
    : {
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code,
            message: `Field "${key}" must be an object when present.`,
            path: formatPath(parentPath, key),
          }),
        ],
      };
}

function readOptionalStringArray(
  value: Record<string, unknown>,
  key: string,
  parentPath?: string,
): { readonly isValid: boolean; readonly value?: readonly string[]; readonly diagnostics: readonly Diagnostic[] } {
  const entry = value[key];
  if (entry === undefined) return { isValid: true, diagnostics: [] };
  const path = formatPath(parentPath, key);

  if (!Array.isArray(entry)) {
    return {
      isValid: false,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpServerArgsInvalidType,
          message: `Field "${key}" must be an array of strings when present.`,
          path,
        }),
      ],
    };
  }

  const invalidIndex = entry.findIndex((item) => typeof item !== "string");
  return invalidIndex === -1
    ? { isValid: true, value: entry, diagnostics: [] }
    : {
        isValid: false,
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServerArgInvalidType,
            message: `Field "${key}" must contain only strings.`,
            path: `${path}[${invalidIndex}]`,
          }),
        ],
      };
}

function formatPath(parentPath: string | undefined, key: string): string {
  return parentPath === undefined ? key : `${parentPath}.${key}`;
}

function optionalSkills(value: readonly PluginSkill[] | undefined): { readonly skills?: readonly PluginSkill[] } {
  return value === undefined || value.length === 0 ? {} : { skills: value };
}

function optionalMcpServers(
  value: readonly PluginMcpServer[] | undefined,
): { readonly mcpServers?: readonly PluginMcpServer[] } {
  return value === undefined || value.length === 0 ? {} : { mcpServers: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type JsonRead =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" }
  | { readonly kind: "ok"; readonly value: unknown };


export type ContainedPath =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export function isPathInside(root: string, candidate: string): boolean {
  const relation = relative(resolvedPathForContainment(root), resolvedPathForContainment(candidate));
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

export function resolveContained(root: string, relativePath: string): ContainedPath {
  if (hasTraversalSegment(relativePath) || isAbsolute(relativePath)) {
    return {
      ok: false,
      diagnostic: createDiagnostic({
        severity: "error",
        code: diagnosticCodes.pathEscape,
        message: "Path escapes the plugin root.",
        path: relativePath,
      }),
    };
  }

  const absolute = join(resolve(root), ...relativePath.split(/[\\/]/).filter((part) => part.length > 0));
  if (!isPathInside(root, absolute)) {
    return {
      ok: false,
      diagnostic: createDiagnostic({
        severity: "error",
        code: diagnosticCodes.pathEscape,
        message: "Path escapes the plugin root.",
        path: relativePath,
      }),
    };
  }

  return { ok: true, path: absolute };
}

function existingRealPath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function resolvedPathForContainment(path: string): string {
  const absolute = resolve(path);
  const real = existingRealPath(absolute);
  if (real !== undefined) {
    return real;
  }

  try {
    switch (lstatSync(absolute).isSymbolicLink()) {
      case true: {
        const target = readlinkSync(absolute);
        const linked = isAbsolute(target) ? target : resolve(dirname(absolute), target);
        return resolvedPathForContainment(linked);
      }
      case false:
        break;
    }
  } catch {
    // Missing path — resolve via nearest existing ancestor below.
  }

  const parent = dirname(absolute);
  switch (parent === absolute) {
    case true:
      return absolute;
    case false:
      return join(resolvedPathForContainment(parent), basename(absolute));
  }
}

function hasTraversalSegment(rawPath: string): boolean {
  return rawPath.split(/[\\/]/).some((segment) => segment === "..");
}

function pathEscapeDiagnostic(relativePath: string): Diagnostic {
  return createDiagnostic({
    severity: "error",
    code: diagnosticCodes.pathEscape,
    message: "Path escapes the plugin root.",
    path: relativePath,
  });
}

export function loadPluginRoot(root: string): PluginInspection {
  const pluginRoot = resolve(root);
  const rootReal = existingRealPath(pluginRoot) ?? pluginRoot;
  const manifestPath = join(rootReal, "plugin.json");
  if (!isPathInside(rootReal, manifestPath) && existsPath(manifestPath)) {
    return { diagnostics: [pathEscapeDiagnostic("plugin.json")] };
  }
  return foldManifestRead(rootReal, readJson(manifestPath));
}

function existsPath(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function foldManifestRead(rootReal: string, manifestRead: JsonRead): PluginInspection {
  switch (manifestRead.kind) {
    case "missing":
      return rejectedManifest("Plugin manifest could not be read.");
    case "invalid":
      return rejectedManifest("Plugin manifest could not be parsed as JSON.");
    case "ok":
      return inspectLoadedPlugin(rootReal, manifestRead.value);
  }
}

function rejectedManifest(message: string): PluginInspection {
  return {
    diagnostics: [
      createDiagnostic({
        severity: "error",
        code: diagnosticCodes.manifestUnreadable,
        message,
        path: "plugin.json",
      }),
    ],
  };
}

function inspectLoadedPlugin(rootReal: string, manifestValue: unknown): PluginInspection {
  if (!isRecord(manifestValue)) {
    return inspectManifest(manifestValue);
  }

  const manifest = readManifest(manifestValue, "portable");
  // Agent Plugins v1.0.0 loading-and-discovery: fatal manifest rejection aborts component discovery.
  if (manifest.value === undefined) {
    return { diagnostics: manifest.diagnostics };
  }

  const skillDiscovery = discoverSkills(rootReal);
  const mcpDiscovery = discoverMcpServers(rootReal);
  const skills = readSkills(skillDiscovery.skills.length === 0 ? undefined : skillDiscovery.skills);
  const mcpServers = readMcpServers(mcpDiscovery.mcpServers);
  const onboarded = readOnboardedPlugins(manifest.value.extensions);

  return {
    manifest: manifest.value,
    ...optionalSkills(skills.value),
    ...optionalMcpServers(mcpServers.value),
    ...optionalOnboardedPlugins(onboarded.plugins),
    diagnostics: [
      ...manifest.diagnostics,
      ...skillDiscovery.diagnostics,
      ...mcpDiscovery.diagnostics,
      ...skills.diagnostics,
      ...mcpServers.diagnostics,
      ...onboarded.diagnostics,
    ],
  };
}

function discoverSkills(pluginRoot: string): {
  readonly skills: readonly Record<string, unknown>[];
  readonly diagnostics: readonly Diagnostic[];
} {
  const skillsDir = join(pluginRoot, "skills");
  if (existsPath(skillsDir) && !isPathInside(pluginRoot, skillsDir)) {
    return { skills: [], diagnostics: [pathEscapeDiagnostic("skills")] };
  }

  return listDirectories(skillsDir).reduce<{
    readonly skills: readonly Record<string, unknown>[];
    readonly diagnostics: readonly Diagnostic[];
  }>(
    (acc, entry) => {
      if (hasTraversalSegment(entry)) {
        return {
          skills: acc.skills,
          diagnostics: [...acc.diagnostics, pathEscapeDiagnostic(`skills/${entry}`)],
        };
      }

      const relativeSkillPath = `skills/${entry}/SKILL.md`;
      const skillDir = join(pluginRoot, "skills", entry);
      const skillFilePath = join(pluginRoot, relativeSkillPath);

      if ((existsPath(skillDir) && !isPathInside(pluginRoot, skillDir)) ||
          (existsPath(skillFilePath) && !isPathInside(pluginRoot, skillFilePath))) {
        return {
          skills: acc.skills,
          diagnostics: [...acc.diagnostics, pathEscapeDiagnostic(relativeSkillPath)],
        };
      }

      const skillFile = readText(skillFilePath);
      return skillFile === undefined
        ? {
            skills: acc.skills,
            diagnostics: [
              ...acc.diagnostics,
              createDiagnostic({
                severity: "error",
                code: diagnosticCodes.skillMissingSkillMd,
                message: "Skill directory must contain SKILL.md.",
                path: relativeSkillPath,
              }),
            ],
          }
        : {
            skills: [...acc.skills, skillDeclaration(entry, relativeSkillPath, skillFile)],
            diagnostics: acc.diagnostics,
          };
    },
    { skills: [], diagnostics: [] },
  );
}

function skillDeclaration(entry: string, relativeSkillPath: string, content: string): Record<string, unknown> {
  const frontmatter = parseFrontmatter(content);
  const name = frontmatter["name"];
  const description = frontmatter["description"];

  return {
    path: relativeSkillPath,
    name: typeof name === "string" && name.length > 0 ? name : entry,
    ...(typeof description === "string" ? { description } : {}),
  };
}

function discoverMcpServers(pluginRoot: string): {
  readonly mcpServers: unknown;
  readonly diagnostics: readonly Diagnostic[];
} {
  const mcpPath = join(pluginRoot, "mcp.json");
  if (existsPath(mcpPath) && !isPathInside(pluginRoot, mcpPath)) {
    return { mcpServers: undefined, diagnostics: [pathEscapeDiagnostic("mcp.json")] };
  }

  const mcpRead = readJson(mcpPath);
  switch (mcpRead.kind) {
    case "missing":
      return { mcpServers: undefined, diagnostics: [] };
    case "invalid":
      return {
        mcpServers: undefined,
        diagnostics: [
          createDiagnostic({
            severity: "error",
            code: diagnosticCodes.mcpServersInvalidType,
            message: "MCP configuration must be valid JSON.",
            path: "mcp.json",
          }),
        ],
      };
    case "ok":
      return normalizeMcpConfiguration(mcpRead.value);
  }
}

function normalizeMcpConfiguration(value: unknown): {
  readonly mcpServers: unknown;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (!isRecord(value)) {
    return {
      mcpServers: undefined,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpServersInvalidType,
          message: "MCP configuration top-level value must be a JSON object.",
          path: "mcp.json",
        }),
      ],
    };
  }
  if (value["mcpServers"] === undefined) {
    return {
      mcpServers: value,
      diagnostics: [
        legacyMcpFormatDiagnostic(
          "mcp.json",
          `Bare mcp.json server map is legacy. Wrap servers under "mcpServers" with "$schema": "${MCP_SCHEMA_URL}".`,
        ),
      ],
    };
  }
  const extraKeys = Object.keys(value).filter((key) => key !== "$schema" && key !== "mcpServers");
  if (extraKeys.length > 0) {
    return {
      mcpServers: undefined,
      diagnostics: extraKeys.map((key) =>
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpServersInvalidType,
          message: `Unknown top-level mcp.json field "${key}". Only "$schema" and "mcpServers" are allowed.`,
          path: `mcp.json.${key}`,
        }),
      ),
    };
  }
  const schema = value["$schema"];
  if (schema === undefined) {
    return {
      mcpServers: value["mcpServers"],
      diagnostics: [
        legacyMcpFormatDiagnostic(
          "mcp.json.$schema",
          `mcp.json omits "$schema". Add "$schema": "${MCP_SCHEMA_URL}" for Agent Plugins v1.0.0 compliance.`,
        ),
      ],
    };
  }
  if (schema !== MCP_SCHEMA_URL) {
    return {
      mcpServers: undefined,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.mcpSchemaInvalid,
          message: `Unsupported mcp.json "$schema" ${JSON.stringify(schema)}. Supported: "${MCP_SCHEMA_URL}".`,
          path: "mcp.json.$schema",
        }),
      ],
    };
  }
  return { mcpServers: value["mcpServers"], diagnostics: [] };
}

function readJson(absolutePath: string): JsonRead {
  const text = readText(absolutePath);
  if (text === undefined) return { kind: "missing" };

  try {
    return { kind: "ok", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "invalid" };
  }
}

function readText(absolutePath: string): string | undefined {
  try {
    return readFileSync(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

function listDirectories(directory: string): readonly string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => (entry.isDirectory() || entry.isSymbolicLink() ? [entry.name] : []))
      .reduce<readonly string[]>(insertSorted, []);
  } catch {
    return [];
  }
}

function insertSorted(items: readonly string[], item: string): readonly string[] {
  const index = items.findIndex((existing) => item.localeCompare(existing, "en") < 0);
  return index === -1 ? [...items, item] : [...items.slice(0, index), item, ...items.slice(index)];
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (match === null) return {};

  const body = match[1] ?? "";
  return body
    .split(/\r?\n/)
    .map((line) => line.split(":"))
    .filter((parts) => parts.length >= 2)
    .reduce<Record<string, string>>((acc, parts) => {
      const key = parts[0]?.trim();
      if (!key) return acc;
      return { ...acc, [key]: parts.slice(1).join(":").trim() };
    }, {});
}

function validateAuthoringPluginName(name: string): Diagnostic | undefined {
  return isValidPluginName(name)
    ? undefined
    : createDiagnostic({
        severity: "error",
        code: diagnosticCodes.authoringNameInvalid,
        message:
          'Plugin name must be 1-64 lowercase characters (a-z, 0-9, "-", "."), starting and ending with a letter or digit, with no "--" or "..".',
        path: "name",
      });
}

function validateAuthoringSkillName(name: string): Diagnostic | undefined {
  return isValidSkillDirectoryName(name)
    ? undefined
    : createDiagnostic({
        severity: "error",
        code: diagnosticCodes.authoringNameInvalid,
        message: "Skill name must be a lowercase kebab-case directory segment.",
        path: "skillName",
      });
}

function unsafePathDiagnostic(rawPath: string): Diagnostic | undefined {
  return hasTraversalSegment(rawPath)
    ? createDiagnostic({
        severity: "error",
        code: diagnosticCodes.authoringDestinationUnsafe,
        message: "Authoring paths must not contain '..' segments.",
        path: rawPath,
      })
    : undefined;
}

function checkCreateDestination(destination: string): Diagnostic | undefined {
  if (!existsSync(destination)) return undefined;

  const stats = statSync(destination);
  if (!stats.isDirectory()) {
    return createDiagnostic({
      severity: "error",
      code: diagnosticCodes.authoringDestinationExists,
      message: "Create destination exists and is not an empty directory.",
      path: destination,
    });
  }

  return readdirSync(destination).length === 0
    ? undefined
    : createDiagnostic({
        severity: "error",
        code: diagnosticCodes.authoringDestinationExists,
        message: "Create destination exists and is not an empty directory.",
        path: destination,
      });
}

function checkAuthoringPluginRoot(pluginRoot: string): Diagnostic | undefined {
  try {
    readFileSync(join(pluginRoot, "plugin.json"), "utf8");
    return undefined;
  } catch {
    return createDiagnostic({
      severity: "error",
      code: diagnosticCodes.authoringPluginRootInvalid,
      message: 'Plugin root must contain a readable "plugin.json".',
      path: "plugin.json",
    });
  }
}

function writeCreateScaffold(options: {
  readonly name: string;
  readonly destination: string;
  readonly createdRoot: boolean;
}): AuthoringResult {
  try {
    mkdirSync(options.destination, { recursive: true });
    writeFileSync(join(options.destination, "plugin.json"), buildPluginManifestJson(options.name));
    mkdirSync(join(options.destination, "skills"), { recursive: true });
    return {
      diagnostics: [],
      path: options.destination,
      name: options.name,
      nextSteps: [
        `Add a skill: agent-plugin add skill <skill-name> --path ${options.destination}`,
        `Validate: agent-plugin validate ${options.destination}`,
        `Inspect: agent-plugin inspect ${options.destination}`,
      ],
    };
  } catch (error) {
    rollbackCreate(options.destination, options.createdRoot);
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.authoringWriteFailed,
          message: error instanceof Error ? error.message : "Failed to write plugin scaffold.",
          path: options.destination,
        }),
      ],
    };
  }
}

function writeSkillScaffold(options: {
  readonly skillName: string;
  readonly skillDir: string;
  readonly skillPath: string;
}): AuthoringResult {
  try {
    mkdirSync(dirname(options.skillPath), { recursive: true });
    writeFileSync(options.skillPath, buildSkillMarkdown(options.skillName));
    return {
      diagnostics: [],
      path: options.skillPath,
      name: options.skillName,
    };
  } catch (error) {
    rollbackPath(options.skillDir);
    return {
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: diagnosticCodes.authoringWriteFailed,
          message: error instanceof Error ? error.message : "Failed to write skill scaffold.",
          path: options.skillPath,
        }),
      ],
    };
  }
}

function rollbackCreate(destination: string, createdRoot: boolean): void {
  switch (createdRoot) {
    case true:
      rollbackPath(destination);
      return;
    case false:
      rollbackPath(join(destination, "plugin.json"));
      rollbackPath(join(destination, "skills"));
      return;
  }
}

function rollbackPath(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup at the program edge.
  }
}

function titleCaseSkill(name: string): string {
  return name
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

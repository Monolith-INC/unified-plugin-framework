import type { Diagnostic, PluginMcpServer } from "@agent-plugins/core";
import {
  createJsonPayloadFile,
  createMarkdownPayloadFile,
  failure,
  finalizeVendorBundle,
  stableJson,
  success,
  validateInstallPlan,
  validateVendorBundle,
  type CanonicalHookIntent,
  type CanonicalPlugin,
  type CanonicalRule,
  type InstallPlan,
  type InstallTarget,
  type JsonValue,
  type PayloadFile,
  type Result,
  type VendorAdapter,
  type VendorBundle,
  type VendorBundleDraft,
} from "@agent-plugins/compiler";

export const CURSOR_ADAPTER_VERSION = "1.0.0" as const;
export const CURSOR_SCHEMA_VERSION = "cursor-plugins-2026-08-10" as const;
export const CURSOR_SCHEMA_EVIDENCE = Object.freeze([
  "https://cursor.com/docs/reference/plugins",
  "https://cursor.com/docs/hooks",
] as const);

const CURSOR_MANIFEST_PATH = ".cursor-plugin/plugin.json";
const CURSOR_HOOKS_PATH = "hooks/hooks.json";
const CURSOR_MCP_PATH = "mcp.json";
const CURSOR_NAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const cursorAdapter: VendorAdapter = Object.freeze({
  vendor: "cursor",
  adapterVersion: CURSOR_ADAPTER_VERSION,
  vendorSchemaVersion: CURSOR_SCHEMA_VERSION,
  compile: compileCursorPayload,
  validate: validateCursorBundle,
  planInstallation: planCursorInstallation,
});

export function compileCursorPayload(plugin: CanonicalPlugin): Result<VendorBundleDraft> {
  const name = cursorPluginName(plugin.manifest.name);
  if (!CURSOR_NAME.test(name)) return cursorFailure("cursor.manifest.name", "Canonical name cannot map to a Cursor plugin name.", "manifest.name");

  const rules = plugin.rules.map(renderCursorRule);
  const hooks = renderCursorHooks(plugin.hookIntents);
  const mcp = renderCursorMcp(plugin.mcpServers);
  const diagnostics = [
    ...rules.flatMap((result) => result.ok ? [] : result.diagnostics),
    ...(hooks.ok ? [] : hooks.diagnostics),
    ...(mcp.ok ? [] : mcp.diagnostics),
  ];
  if (diagnostics.length > 0) return failure(diagnostics[0] as Diagnostic, ...diagnostics.slice(1));

  const files: Result<PayloadFile>[] = [
    createJsonPayloadFile({
      path: CURSOR_MANIFEST_PATH,
      value: {
        name,
        version: plugin.manifest.version,
        ...(plugin.manifest.description === undefined ? {} : { description: plugin.manifest.description }),
        ...(plugin.skills.length === 0 ? {} : { skills: "skills/" }),
        ...(plugin.rules.length === 0 ? {} : { rules: "rules/" }),
        ...(plugin.hookIntents.length === 0 ? {} : { hooks: CURSOR_HOOKS_PATH }),
        ...(plugin.mcpServers.length === 0 ? {} : { mcpServers: CURSOR_MCP_PATH }),
      },
    }),
    ...plugin.skills.map((skill) =>
      createMarkdownPayloadFile({ path: skill.path, content: skill.content }),
    ),
    ...rules,
    ...(hooks.ok && hooks.value !== undefined
      ? [createJsonPayloadFile({ path: CURSOR_HOOKS_PATH, value: hooks.value })]
      : []),
    ...(mcp.ok && mcp.value !== undefined
      ? [createJsonPayloadFile({ path: CURSOR_MCP_PATH, value: mcp.value })]
      : []),
  ];
  const fileDiagnostics = files.flatMap((result) => result.ok ? [] : result.diagnostics);
  if (fileDiagnostics.length > 0) return failure(fileDiagnostics[0] as Diagnostic, ...fileDiagnostics.slice(1));
  return success({
    plugin: { name: plugin.manifest.name, version: plugin.manifest.version },
    vendor: "cursor",
    adapter: { version: CURSOR_ADAPTER_VERSION, vendorSchemaVersion: CURSOR_SCHEMA_VERSION },
    sourceDigest: plugin.sourceDigest,
    files: files.flatMap((result) => result.ok ? [result.value] : []),
  });
}

export function validateCursorBundle(bundle: VendorBundle): readonly Diagnostic[] {
  const common = validateVendorBundle(bundle);
  if (common.length > 0) return common;
  const paths = new Set<string>(bundle.files.map((file) => file.path));
  const allowed = /^(?:\.cursor-plugin\/plugin\.json|skills\/[^/]+\/SKILL\.md|rules\/[^/]+\.mdc|hooks\/hooks\.json|mcp\.json)$/;
  const manifest = parseJsonFile(bundle, CURSOR_MANIFEST_PATH);
  return [
    ...(bundle.manifest.vendor !== "cursor" || bundle.manifest.adapter.version !== CURSOR_ADAPTER_VERSION ||
        bundle.manifest.adapter.vendorSchemaVersion !== CURSOR_SCHEMA_VERSION
      ? [cursorDiagnostic("cursor.bundle.identity", "Bundle is not owned by this Cursor adapter.")]
      : []),
    ...bundle.files
      .filter((file) => !allowed.test(file.path))
      .map((file) => cursorDiagnostic("cursor.payload.path", "Unexpected Cursor payload path.", file.path)),
    ...(manifest.ok ? validateCursorManifest(manifest.value, paths) : manifest.diagnostics),
    ...bundle.files
      .filter((entry) => entry.path.startsWith("skills/"))
      .flatMap((file) => {
        const text = decodeText(file);
        return !text.ok || !/^---\n[\s\S]*\n---\n/u.test(text.value)
          ? [cursorDiagnostic("cursor.skill.invalid", "Cursor Skills require YAML frontmatter.", file.path)]
          : [];
      }),
    ...bundle.files
      .filter((entry) => entry.path.startsWith("rules/"))
      .flatMap((file) => {
        const text = decodeText(file);
        return !text.ok || !/^---\ndescription: [^\n]+\nglobs: \[[^\n]*\]\nalwaysApply: (?:true|false)\n---\n/u.test(text.value)
          ? [cursorDiagnostic("cursor.rule.invalid", "Cursor rules require deterministic MDC frontmatter.", file.path)]
          : [];
      }),
    ...(paths.has(CURSOR_HOOKS_PATH) ? validateCursorHooks(parseJsonFile(bundle, CURSOR_HOOKS_PATH)) : []),
    ...(paths.has(CURSOR_MCP_PATH) ? validateCursorMcp(parseJsonFile(bundle, CURSOR_MCP_PATH)) : []),
  ];
}

export function planCursorInstallation(bundle: VendorBundle, _target: InstallTarget): Result<InstallPlan> {
  const diagnostics = validateCursorBundle(bundle);
  if (diagnostics.length > 0) return failure(diagnostics[0] as Diagnostic, ...diagnostics.slice(1));
  const plan: InstallPlan = {
    plugin: bundle.manifest.plugin.name,
    version: bundle.manifest.plugin.version,
    vendor: "cursor",
    bundleDigest: bundle.manifest.payloadDigest,
    writes: bundle.files.map((file) => ({ source: file.path, destination: file.path, mode: file.mode })),
  };
  const planDiagnostics = validateInstallPlan(plan, bundle);
  return planDiagnostics.length === 0
    ? success(plan)
    : failure(planDiagnostics[0] as Diagnostic, ...planDiagnostics.slice(1));
}

function renderCursorRule(rule: CanonicalRule): Result<PayloadFile> {
  if (rule.activation === "model-decides" && (rule.description === undefined || rule.description.length === 0)) {
    return cursorFailure("cursor.rule.unsupported", "Model-decides Cursor rules require a description.", rule.id);
  }
  const description = rule.description ?? rule.id;
  const markdown = [
    "---",
    `description: ${JSON.stringify(description)}`,
    `globs: ${JSON.stringify(rule.fileGlobs)}`,
    `alwaysApply: ${rule.activation === "always"}`,
    "---",
    rule.content,
  ].join("\n");
  return createMarkdownPayloadFile({ path: `rules/${rule.id}.mdc`, content: markdown });
}

type CursorHookEntry = {
  readonly command: string;
  readonly timeout?: number;
  readonly matcher?: string;
};

function renderCursorHooks(intents: readonly CanonicalHookIntent[]): Result<JsonValue | undefined> {
  if (intents.length === 0) return success(undefined);
  const mapped = intents.map((intent) => ({ intent, mappings: cursorHookMappings(intent) }));
  const failed = mapped.find(({ mappings }) => !mappings.ok);
  if (failed !== undefined && !failed.mappings.ok) return failed.mappings;
  const hooks = mapped.reduce<Readonly<Record<string, readonly CursorHookEntry[]>>>(
    (acc, { intent, mappings }) =>
      !mappings.ok
        ? acc
        : mappings.value.reduce<Readonly<Record<string, readonly CursorHookEntry[]>>>(
            (inner, mapping) => ({
              ...inner,
              [mapping.event]: [
                ...(inner[mapping.event] ?? []),
                {
                  command: [intent.executable, ...intent.arguments].map((part) => JSON.stringify(part)).join(" "),
                  ...(intent.timeoutSeconds === undefined ? {} : { timeout: intent.timeoutSeconds }),
                  ...(mapping.matcher === undefined ? {} : { matcher: mapping.matcher }),
                },
              ],
            }),
            acc,
          ),
    {},
  );
  return success({ version: 1, hooks });
}

function cursorHookMappings(intent: CanonicalHookIntent): Result<readonly { readonly event: string; readonly matcher?: string }[]> {
  switch (intent.lifecycle) {
    case "session-start": return success([{ event: "sessionStart" }]);
    case "session-end": return success([{ event: "sessionEnd" }]);
    case "before-prompt": return success([{ event: "beforeSubmitPrompt" }]);
    case "stop": return success([{ event: "stop" }]);
    case "before-tool":
    case "after-tool": {
      if (intent.toolKinds.length === 0) return cursorFailure("cursor.hook.unsupported", "Tool hooks require at least one portable tool kind.", intent.id);
      const lifecycle: "before-tool" | "after-tool" = intent.lifecycle === "before-tool" ? "before-tool" : "after-tool";
      return success(intent.toolKinds.map((kind) => mapCursorToolEvent(lifecycle, kind)));
    }
  }
}

function mapCursorToolEvent(lifecycle: "before-tool" | "after-tool", kind: CanonicalHookIntent["toolKinds"][number]): { readonly event: string; readonly matcher?: string } {
  if (lifecycle === "before-tool") {
    switch (kind) {
      case "shell": return { event: "beforeShellExecution" };
      case "file-read": return { event: "beforeReadFile" };
      case "file-write": return { event: "preToolUse", matcher: "Write" };
      case "mcp": return { event: "beforeMCPExecution" };
    }
  }
  switch (kind) {
    case "shell": return { event: "afterShellExecution" };
    case "file-read": return { event: "postToolUse", matcher: "Read" };
    case "file-write": return { event: "afterFileEdit" };
    case "mcp": return { event: "afterMCPExecution" };
  }
}

const renderCursorMcpServer = (server: PluginMcpServer, name: string): Result<readonly [string, JsonValue]> => {
  switch (server.transport) {
    case "stdio":
      return success([
        name,
        {
          command: server.command,
          ...(server.args === undefined ? {} : { args: server.args }),
          ...(server.env === undefined ? {} : { env: server.env }),
          ...(server.cwd === undefined ? {} : { cwd: server.cwd }),
        },
      ] as const);
    case "streamable-http":
      return success([name, { url: server.url, ...(server.headers === undefined ? {} : { headers: server.headers }) }] as const);
    case "sse":
      return success([name, { type: "sse", url: server.url, ...(server.headers === undefined ? {} : { headers: server.headers }) }] as const);
    case "config-path":
      return cursorFailure("cursor.mcp.unsupported", "Cursor payloads cannot inline an opaque MCP config-path declaration.", name);
  }
};

function renderCursorMcp(servers: readonly PluginMcpServer[]): Result<JsonValue | undefined> {
  if (servers.length === 0) return success(undefined);
  const built = servers.reduce<Result<Readonly<Record<string, JsonValue>>>>(
    (acc, server, index) => {
      if (!acc.ok) return acc;
      const name = server.name ?? `server-${index + 1}`;
      if (acc.value[name] !== undefined) return cursorFailure("cursor.mcp.duplicate", "Cursor MCP server names must be unique.", name);
      const entry = renderCursorMcpServer(server, name);
      return entry.ok ? success({ ...acc.value, [entry.value[0]]: entry.value[1] }) : entry;
    },
    success({}),
  );
  return built.ok ? success({ mcpServers: built.value }) : built;
}

function validateCursorManifest(value: unknown, paths: ReadonlySet<string>): readonly Diagnostic[] {
  if (!isRecord(value)) return [cursorDiagnostic("cursor.manifest.invalid", "Cursor manifest must be an object.", CURSOR_MANIFEST_PATH)];
  const allowed = ["name", "version", "description", "skills", "rules", "hooks", "mcpServers"];
  const components: readonly (readonly [string, string, boolean])[] = [
    ["skills", "skills/", [...paths].some((path) => path.startsWith("skills/"))],
    ["rules", "rules/", [...paths].some((path) => path.startsWith("rules/"))],
    ["hooks", CURSOR_HOOKS_PATH, paths.has(CURSOR_HOOKS_PATH)],
    ["mcpServers", CURSOR_MCP_PATH, paths.has(CURSOR_MCP_PATH)],
  ];
  return [
    ...Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => cursorDiagnostic("cursor.manifest.unknown_field", "Unknown Cursor manifest field.", key)),
    ...(typeof value["name"] !== "string" || !CURSOR_NAME.test(value["name"]) ? [cursorDiagnostic("cursor.manifest.name", "Cursor manifest name is invalid.", "name")] : []),
    ...(typeof value["version"] !== "string" || !SEMVER.test(value["version"]) ? [cursorDiagnostic("cursor.manifest.version", "Cursor manifest version must be semantic.", "version")] : []),
    ...components
      .filter(([field, expected, present]) => (present ? value[field] !== expected : value[field] !== undefined))
      .map(([field]) => cursorDiagnostic("cursor.manifest.component", "Cursor component declaration does not match payload contents.", field)),
  ];
}

function validateCursorHooks(result: Result<unknown>): readonly Diagnostic[] {
  if (!result.ok) return result.diagnostics;
  if (!isRecord(result.value) || result.value["version"] !== 1 || !isRecord(result.value["hooks"])) return [cursorDiagnostic("cursor.hooks.invalid", "Cursor hooks config must contain version 1 and a hooks object.", CURSOR_HOOKS_PATH)];
  const events = new Set(["sessionStart", "sessionEnd", "preToolUse", "postToolUse", "beforeShellExecution", "afterShellExecution", "beforeMCPExecution", "afterMCPExecution", "beforeReadFile", "afterFileEdit", "beforeSubmitPrompt", "stop"]);
  return Object.entries(result.value["hooks"]).flatMap(([event, entries]) => {
    if (!events.has(event) || !Array.isArray(entries)) return [cursorDiagnostic("cursor.hooks.event", "Unsupported Cursor hook event.", event)];
    return entries.flatMap((entry) => !isRecord(entry) || typeof entry["command"] !== "string" || entry["command"].length === 0 ? [cursorDiagnostic("cursor.hooks.entry", "Cursor command hook is invalid.", event)] : []);
  });
}

function validateCursorMcp(result: Result<unknown>): readonly Diagnostic[] {
  if (!result.ok) return result.diagnostics;
  if (!isRecord(result.value) || !isRecord(result.value["mcpServers"])) return [cursorDiagnostic("cursor.mcp.invalid", "Cursor MCP config must contain mcpServers.", CURSOR_MCP_PATH)];
  return Object.entries(result.value["mcpServers"]).flatMap(([name, server]) => {
    if (!isRecord(server)) return [cursorDiagnostic("cursor.mcp.server", "Cursor MCP server must be an object.", name)];
    const command = typeof server["command"] === "string";
    const url = typeof server["url"] === "string";
    return command !== url ? [] : [cursorDiagnostic("cursor.mcp.transport", "Cursor MCP server must define exactly one command or URL.", name)];
  });
}

function parseJsonFile(bundle: VendorBundle, path: string): Result<unknown> {
  const file = bundle.files.find((entry) => entry.path === path);
  if (file === undefined) return cursorFailure("cursor.payload.missing", "Required Cursor payload file is missing.", path);
  try { return success(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.content)) as unknown); }
  catch { return cursorFailure("cursor.json.invalid", "Cursor JSON payload is invalid UTF-8 JSON.", path); }
}

function decodeText(file: PayloadFile): Result<string> {
  try { return success(new TextDecoder("utf-8", { fatal: true }).decode(file.content)); }
  catch { return cursorFailure("cursor.text.invalid", "Cursor text payload is not UTF-8.", file.path); }
}

function cursorPluginName(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

function cursorFailure(code: string, message: string, path?: string): Result<never> {
  return failure(cursorDiagnostic(code, message, path));
}

function cursorDiagnostic(code: string, message: string, path?: string): Diagnostic {
  return { severity: "error", code, message, ...(path === undefined ? {} : { path }) };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

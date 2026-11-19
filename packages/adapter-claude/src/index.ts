import { isPluginAuthor, type Diagnostic, type PluginMcpServer } from "@agent-plugins/core";
import {
  createJsonPayloadFile,
  createMarkdownPayloadFile,
  failure,
  success,
  validateInstallPlan,
  validateVendorBundle,
  type CanonicalHookIntent,
  type CanonicalPlugin,
  type InstallPlan,
  type InstallTarget,
  type JsonValue,
  type PayloadFile,
  type Result,
  type VendorAdapter,
  type VendorBundle,
  type VendorBundleDraft,
} from "@agent-plugins/compiler";
import { andThen, concatAll, isRecord, type Monoid } from "@agent-plugins/compiler/railway";

export const CLAUDE_ADAPTER_VERSION = "1.0.0" as const;
export const CLAUDE_SCHEMA_VERSION = "claude-code-plugins-2026-08-10" as const;
export const CLAUDE_SCHEMA_EVIDENCE = Object.freeze([
  "https://code.claude.com/docs/en/plugins-reference",
  "https://code.claude.com/docs/en/hooks",
] as const);

const MANIFEST_PATH = ".claude-plugin/plugin.json";
const HOOKS_PATH = "hooks/hooks.json";
const MCP_PATH = ".mcp.json";
const NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const claudeAdapter: VendorAdapter = Object.freeze({
  vendor: "claude",
  adapterVersion: CLAUDE_ADAPTER_VERSION,
  vendorSchemaVersion: CLAUDE_SCHEMA_VERSION,
  compile: compileClaudePayload,
  validate: validateClaudeBundle,
  planInstallation: planClaudeInstallation,
});

export function compileClaudePayload(plugin: CanonicalPlugin): Result<VendorBundleDraft> {
  const name = pluginName(plugin.manifest.name);
  if (!NAME.test(name)) return fail("claude.manifest.name", "Canonical name cannot map to a Claude Code plugin name.", "manifest.name");
  if (plugin.rules.length > 0) {
    return fail(
      "claude.rule.unsupported",
      "Claude Code plugins have no native rules component; standalone .claude/rules files are outside plugin payloads.",
      plugin.rules[0]?.id,
    );
  }

  const hooks = renderHooks(plugin.hookIntents);
  const mcp = renderMcp(plugin.mcpServers);
  const diagnostics = [...(hooks.ok ? [] : hooks.diagnostics), ...(mcp.ok ? [] : mcp.diagnostics)];
  if (diagnostics.length > 0) return failure(diagnostics[0] as Diagnostic, ...diagnostics.slice(1));

  const files: Result<PayloadFile>[] = [
    createJsonPayloadFile({
      path: MANIFEST_PATH,
      value: {
        name,
        version: plugin.manifest.version,
        ...(plugin.manifest.description === undefined ? {} : { description: plugin.manifest.description }),
        ...(plugin.manifest.author === undefined ? {} : { author: plugin.manifest.author }),
        ...(plugin.manifest.license === undefined ? {} : { license: plugin.manifest.license }),
      },
    }),
    ...plugin.skills.map((skill) => createMarkdownPayloadFile({ path: skill.path, content: skill.content })),
    ...(hooks.ok && hooks.value !== undefined ? [createJsonPayloadFile({ path: HOOKS_PATH, value: hooks.value })] : []),
    ...(mcp.ok && mcp.value !== undefined ? [createJsonPayloadFile({ path: MCP_PATH, value: mcp.value })] : []),
  ];
  const fileDiagnostics = files.flatMap((result) => result.ok ? [] : result.diagnostics);
  if (fileDiagnostics.length > 0) return failure(fileDiagnostics[0] as Diagnostic, ...fileDiagnostics.slice(1));
  return success({
    plugin: { name: plugin.manifest.name, version: plugin.manifest.version },
    vendor: "claude",
    adapter: { version: CLAUDE_ADAPTER_VERSION, vendorSchemaVersion: CLAUDE_SCHEMA_VERSION },
    sourceDigest: plugin.sourceDigest,
    files: files.flatMap((result) => result.ok ? [result.value] : []),
  });
}

export function validateClaudeBundle(bundle: VendorBundle): readonly Diagnostic[] {
  const common = validateVendorBundle(bundle);
  return common.length > 0 ? common : claudeBundleDiagnostics(bundle);
}

const PAYLOAD_PATH = /^(?:\.claude-plugin\/plugin\.json|skills\/[^/]+\/SKILL\.md|hooks\/hooks\.json|\.mcp\.json)$/;
const FRONTMATTER = /^---\n[\s\S]*\n---\n/u;
/** Every Claude-specific problem, in the order identity, paths, manifest, skills, hooks, MCP. */
function claudeBundleDiagnostics(bundle: VendorBundle): readonly Diagnostic[] {
  const paths = new Set<string>(bundle.files.map((file) => file.path));
  const manifest = parseJson(bundle, MANIFEST_PATH);
  return [
    ...(ownedByAdapter(bundle) ? [] : [diagnostic("claude.bundle.identity", "Bundle is not owned by this Claude adapter.")]),
    ...bundle.files.filter((file) => !PAYLOAD_PATH.test(file.path)).map((file) => diagnostic("claude.payload.path", "Unexpected Claude payload path.", file.path)),
    ...(manifest.ok ? validateManifest(manifest.value, paths) : manifest.diagnostics),
    ...bundle.files.filter((file) => file.path.startsWith("skills/") && !hasFrontmatter(file))
      .map((file) => diagnostic("claude.skill.invalid", "Claude Skills require YAML frontmatter.", file.path)),
    ...(paths.has(HOOKS_PATH) ? validateHooks(parseJson(bundle, HOOKS_PATH)) : []),
    ...(paths.has(MCP_PATH) ? validateMcp(parseJson(bundle, MCP_PATH)) : []),
  ];
}

function ownedByAdapter(bundle: VendorBundle): boolean {
  return bundle.manifest.vendor === "claude" && bundle.manifest.adapter.version === CLAUDE_ADAPTER_VERSION
    && bundle.manifest.adapter.vendorSchemaVersion === CLAUDE_SCHEMA_VERSION;
}

function hasFrontmatter(file: PayloadFile): boolean {
  const text = decodeText(file);
  return text.ok && FRONTMATTER.test(text.value);
}

export function planClaudeInstallation(bundle: VendorBundle, _target: InstallTarget): Result<InstallPlan> {
  const diagnostics = validateClaudeBundle(bundle);
  if (diagnostics.length > 0) return failure(diagnostics[0] as Diagnostic, ...diagnostics.slice(1));
  const plan: InstallPlan = {
    plugin: bundle.manifest.plugin.name,
    version: bundle.manifest.plugin.version,
    vendor: "claude",
    bundleDigest: bundle.manifest.payloadDigest,
    writes: bundle.files.map((file) => ({ source: file.path, destination: file.path, mode: file.mode })),
  };
  const planDiagnostics = validateInstallPlan(plan, bundle);
  return planDiagnostics.length === 0 ? success(plan) : failure(planDiagnostics[0] as Diagnostic, ...planDiagnostics.slice(1));
}

type HookCommand = { readonly type: "command"; readonly command: string; readonly timeout?: number };
type HookGroup = { readonly matcher?: string; readonly hooks: readonly HookCommand[] };

type HookEvents = Readonly<Record<string, readonly HookGroup[]>>;
type HookMapping = { readonly event: string; readonly matcher?: string };

/** Hook groups by event: `concat` appends each event's groups in order, and events keep the order they first appear in. */
export const HOOK_EVENTS: Monoid<HookEvents> = Object.freeze({
  empty: {},
  concat: (x: HookEvents, y: HookEvents): HookEvents => ({
    ...x, ...Object.fromEntries(Object.entries(y).map(([event, groups]) => [event, [...(x[event] ?? []), ...groups]])),
  }),
});

function renderHooks(intents: readonly CanonicalHookIntent[]): Result<JsonValue | undefined> {
  if (intents.length === 0) return success(undefined);
  return andThen(firstFailureOrAll(intents.map((intent) => andThen(hookMappings(intent), (mappings) => success(intentEvents(intent, mappings))))),
    (events): Result<JsonValue | undefined> => success({ hooks: concatAll(HOOK_EVENTS)(events) } as JsonValue));
}

function intentEvents(intent: CanonicalHookIntent, mappings: readonly HookMapping[]): HookEvents {
  return concatAll(HOOK_EVENTS)(mappings.map((mapping) => ({ [mapping.event]: [hookGroup(intent, mapping)] })));
}

function hookGroup(intent: CanonicalHookIntent, mapping: HookMapping): HookGroup {
  return {
    ...(mapping.matcher === undefined ? {} : { matcher: mapping.matcher }),
    hooks: [{
      type: "command",
      command: [intent.executable, ...intent.arguments].map((part) => JSON.stringify(part)).join(" "),
      ...(intent.timeoutSeconds === undefined ? {} : { timeout: intent.timeoutSeconds }),
    }],
  };
}

/** Every value in order, or the first failure; later results are not consulted once one fails. */
function firstFailureOrAll<A>(results: readonly Result<A>[]): Result<readonly A[]> {
  const [next, ...rest] = results;
  return next === undefined ? success([]) : andThen(next, (value) => andThen(firstFailureOrAll(rest), (values): Result<readonly A[]> => success([value, ...values])));
}

function hookMappings(intent: CanonicalHookIntent): Result<readonly HookMapping[]> {
  switch (intent.lifecycle) {
    case "session-start": return success([{ event: "SessionStart" }]);
    case "session-end": return success([{ event: "SessionEnd" }]);
    case "before-prompt": return success([{ event: "UserPromptSubmit" }]);
    case "stop": return success([{ event: "Stop" }]);
    case "before-tool":
    case "after-tool": {
      if (intent.toolKinds.length === 0) return fail("claude.hook.unsupported", "Claude tool hooks require at least one portable tool kind.", intent.id);
      const event = intent.lifecycle === "before-tool" ? "PreToolUse" : "PostToolUse";
      return success(intent.toolKinds.map((kind) => ({ event, matcher: toolMatcher(kind) })));
    }
  }
}

function toolMatcher(kind: CanonicalHookIntent["toolKinds"][number]): string {
  switch (kind) {
    case "shell": return "Bash";
    case "file-read": return "Read";
    case "file-write": return "Write|Edit";
    case "mcp": return "mcp__.*";
  }
}

function renderMcp(servers: readonly PluginMcpServer[]): Result<JsonValue | undefined> {
  if (servers.length === 0) return success(undefined);
  const named = servers.map((server, index) => ({ server, name: server.name ?? `server-${index + 1}` }));
  return andThen(firstFailureOrAll(named.map(({ server, name }, index) => named.findIndex((other) => other.name === name) < index
    ? fail("claude.mcp.duplicate", "Claude MCP server names must be unique.", name)
    : andThen(mcpEntry(server, name), (entry): Result<readonly [string, JsonValue]> => success([name, entry])))),
  (entries): Result<JsonValue | undefined> => success({ mcpServers: Object.fromEntries(entries) }));
}

function mcpEntry(server: PluginMcpServer, name: string): Result<JsonValue> {
  switch (server.transport) {
    case "stdio": return server.cwd !== undefined
      ? fail("claude.mcp.unsupported", "Claude plugin MCP declarations cannot preserve a portable working directory.", name)
      : success({ command: server.command, ...(server.args === undefined ? {} : { args: server.args }) });
    case "streamable-http": return success({ type: "http", url: server.url });
    case "sse": return success({ type: "sse", url: server.url });
    case "config-path": return fail("claude.mcp.unsupported", "Claude payloads cannot inline an opaque MCP config-path declaration.", name);
  }
}

/** One manifest field's rule: the field, whether its value is acceptable, and the problem reported when it is not. */
type FieldRule = readonly [field: string, accepts: (value: unknown) => boolean, code: string, message: string];

const optional = (accepts: (value: unknown) => boolean) => (value: unknown): boolean => value === undefined || accepts(value);

const MANIFEST_RULES: readonly FieldRule[] = [
  ["name", (value) => typeof value === "string" && NAME.test(value), "claude.manifest.name", "Claude manifest name is invalid."],
  ["version", (value) => typeof value === "string" && SEMVER.test(value), "claude.manifest.version", "Claude manifest version must be semantic."],
  ["author", optional(isPluginAuthor), "claude.manifest.author", "Claude manifest author needs a non-empty name and string email and url when present."],
  ["license", optional((value) => typeof value === "string"), "claude.manifest.license", "Claude manifest license must be a string."],
];

const MANIFEST_FIELDS: readonly string[] = ["description", "skills", "hooks", "mcpServers", ...MANIFEST_RULES.map(([field]) => field)];

/**
 * Claude Code loads skills/, hooks/hooks.json and .mcp.json from their default locations, so current payloads do not
 * declare them. Bundles released before that declared each one; such a declaration must name its default and its files.
 */
const componentDeclarations = (paths: ReadonlySet<string>): readonly (readonly [string, string, boolean])[] => [
  ["skills", "./skills/", [...paths].some((path) => path.startsWith("skills/"))],
  ["hooks", `./${HOOKS_PATH}`, paths.has(HOOKS_PATH)],
  ["mcpServers", `./${MCP_PATH}`, paths.has(MCP_PATH)],
];

function validateManifest(value: unknown, paths: ReadonlySet<string>): readonly Diagnostic[] {
  if (!isRecord(value)) return [diagnostic("claude.manifest.invalid", "Claude manifest must be an object.", MANIFEST_PATH)];
  return [
    ...Object.keys(value).filter((key) => !MANIFEST_FIELDS.includes(key)).map((key) => diagnostic("claude.manifest.unknown_field", "Unknown Claude manifest field.", key)),
    ...MANIFEST_RULES.filter(([field, accepts]) => !accepts(value[field])).map(([field, , code, message]) => diagnostic(code, message, field)),
    ...componentDeclarations(paths).filter(([field, expected, present]) => value[field] !== undefined && (!present || value[field] !== expected))
      .map(([field]) => diagnostic("claude.manifest.component", "Claude component declaration does not match payload contents.", field)),
  ];
}

function validateHooks(result: Result<unknown>): readonly Diagnostic[] {
  if (!result.ok) return result.diagnostics;
  if (!isRecord(result.value) || !isRecord(result.value["hooks"])) return [diagnostic("claude.hooks.invalid", "Claude hooks config must contain a hooks object.", HOOKS_PATH)];
  const events = new Set(["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]);
  return Object.entries(result.value["hooks"]).flatMap(([event, groups]) => {
    if (!events.has(event) || !Array.isArray(groups)) return [diagnostic("claude.hooks.event", "Unsupported Claude hook event.", event)];
    return groups.flatMap((group) => {
      if (!isRecord(group) || !Array.isArray(group["hooks"])) return [diagnostic("claude.hooks.group", "Claude hook matcher group is invalid.", event)];
      return group["hooks"].flatMap((entry) => !isRecord(entry) || entry["type"] !== "command" || typeof entry["command"] !== "string" || entry["command"].length === 0
        ? [diagnostic("claude.hooks.entry", "Claude command hook is invalid.", event)] : []);
    });
  });
}

function validateMcp(result: Result<unknown>): readonly Diagnostic[] {
  if (!result.ok) return result.diagnostics;
  if (!isRecord(result.value) || !isRecord(result.value["mcpServers"])) return [diagnostic("claude.mcp.invalid", "Claude MCP config must contain mcpServers.", MCP_PATH)];
  return Object.entries(result.value["mcpServers"]).flatMap(([name, server]) => {
    if (!isRecord(server)) return [diagnostic("claude.mcp.server", "Claude MCP server must be an object.", name)];
    const command = typeof server["command"] === "string";
    const url = typeof server["url"] === "string";
    return command !== url ? [] : [diagnostic("claude.mcp.transport", "Claude MCP server must define exactly one command or URL.", name)];
  });
}

function parseJson(bundle: VendorBundle, path: string): Result<unknown> {
  const file = bundle.files.find((entry) => entry.path === path);
  if (file === undefined) return fail("claude.payload.missing", "Required Claude payload file is missing.", path);
  try { return success(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.content)) as unknown); }
  catch { return fail("claude.json.invalid", "Claude JSON payload is invalid UTF-8 JSON.", path); }
}

function decodeText(file: PayloadFile): Result<string> {
  try { return success(new TextDecoder("utf-8", { fatal: true }).decode(file.content)); }
  catch { return fail("claude.text.invalid", "Claude text payload is not UTF-8.", file.path); }
}

function pluginName(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

function fail(code: string, message: string, path?: string): Result<never> {
  return failure(diagnostic(code, message, path));
}

function diagnostic(code: string, message: string, path?: string): Diagnostic {
  return { severity: "error", code, message, ...(path === undefined ? {} : { path }) };
}

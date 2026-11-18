import { lstat, mkdir, readlink, readdir, symlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { CODEX_TOOLING, codexToolingRegistration, mergeCodexMarketplace } from "@agent-plugins/adapter-codex";
import type { VendorId } from "@agent-plugins/compiler";
import { fail, nodeProjectFiles, object, ok, parseJson, type Result } from "@agent-plugins/project";
import { NODE_PLUGIN_FACTS_IO, skillNames } from "./plugin-reader.js";
import { command, hostRequest } from "./tooling-process.js";
import { readText, readToml, setupFailure, writeText } from "./tooling-files.js";

export const HOST_NAMES = Object.freeze(["codex", "claude", "cursor"] as const);
export type HostName = (typeof HOST_NAMES)[number];
export const isHostName = (value: unknown): value is HostName => (HOST_NAMES as readonly unknown[]).includes(value);

export interface DiscoveredSkill { readonly name: string; readonly path: string }
/** A plugin directory the host should load, under the name its skills are namespaced by. */
export interface HostPlugin { readonly name: string; readonly root: string }
/** Where one project's setup lives; `home` is the user's home, needed only by hosts without project-scoped plugins. */
export interface HostContext {
  readonly project: string;
  readonly tools: string;
  readonly python: string;
  readonly home: string;
  readonly knowledgeCommand?: string;
}

/** One host's names, paths and commands; setup steps stay host-neutral and ask this record. */
export interface HostTooling {
  readonly label: string;
  readonly vendor: VendorId;
  /** Where the framework's own payloads for this host live, relative to the tools root. */
  readonly frameworkDir: string;
  /** The host manifest written beside a staged dependency source. */
  readonly manifest: string;
  /** Project folder the host reads unnamespaced skills from. */
  readonly bareSkills: string;
  readonly catalog: (context: HostContext, plugins: readonly HostPlugin[]) => Promise<Result<string>>;
  readonly register: (context: HostContext) => Promise<Result<string>>;
  readonly registered: (context: HostContext) => Promise<Result<boolean>>;
  readonly activate: (context: HostContext, plugin: HostPlugin) => Promise<Result<string>>;
  readonly discover: (context: HostContext) => Promise<Result<readonly DiscoveredSkill[]>>;
}

const MARKETPLACE = CODEX_TOOLING.marketplace;
const SERVER = CODEX_TOOLING.server;
const record = (value: unknown): Readonly<Record<string, unknown>> => object(value) ? value : {};
const conflict = (label: string, path: string): Result<never> => fail("host-configuration-conflict",
  `Existing ${label} configuration in ${path} differs from this setup.`, "Preserve it; reconcile the named entry, then rerun setup.");
const readJson = (path: string): Promise<Result<unknown>> => readText(path).then((read) => !read.ok ? read : read.value === null ? ok(null) : parseJson(read.value));
const knowledgeEntry = (context: HostContext): Readonly<Record<string, unknown>> => ({ command: context.knowledgeCommand, args: ["--project", context.project] });

/** Adds one owned entry to a JSON map: an equal entry keeps the document as it is; malformed or different content is `null`, never overwritten. */
const mergeEntry = (existing: unknown, key: string, name: string, entry: Readonly<Record<string, unknown>>): unknown => {
  const current = record(existing);
  const map = record(current[key]);
  const old = map[name];
  return (existing !== null && !object(existing)) || (current[key] !== undefined && !object(current[key])) ? null
    : old === undefined ? { ...current, [key]: { ...map, [name]: entry } }
      : JSON.stringify(old) === JSON.stringify(entry) ? existing : null;
};
const writeEntry = async (project: string, path: string, key: string, name: string, entry: Readonly<Record<string, unknown>>, label: string): Promise<Result<string>> => {
  const [old, parsed] = await Promise.all([readText(path), readJson(path)]);
  const merged = parsed.ok ? mergeEntry(parsed.value, key, name, entry) : null;
  return !old.ok ? old : !parsed.ok ? parsed : merged === null ? conflict(label, path)
    : merged === parsed.value ? ok(path) : writeText(project, path, `${JSON.stringify(merged, null, 2)}\n`, old.value);
};
const hasEntry = (path: string, key: string, name: string, entry: Readonly<Record<string, unknown>>): Promise<Result<boolean>> =>
  readJson(path).then((parsed) => parsed.ok ? ok(JSON.stringify(record(record(parsed.value)[key])[name]) === JSON.stringify(entry)) : parsed);

/** Skills a plugin directory exposes through its host manifest's `skills` path. */
const pluginSkills = (plugin: HostPlugin, manifest: string): readonly DiscoveredSkill[] => {
  const raw = NODE_PLUGIN_FACTS_IO.readJson(join(plugin.root, manifest));
  const declared = raw.kind === "value" ? record(raw.value).skills : undefined;
  const dir = join(plugin.root, typeof declared === "string" ? declared : "skills");
  return skillNames(dir).map((skill) => ({ name: `${plugin.name}:${skill}`, path: join(dir, skill, "SKILL.md") }));
};
const bareSkills = (context: HostContext, folder: string): readonly DiscoveredSkill[] =>
  skillNames(join(context.project, folder)).map((skill) => ({ name: skill, path: join(context.project, folder, skill, "SKILL.md") }));

// Codex: project TOML registers a local marketplace; `codex plugin add` activates; the app server reports discovery.
const CODEX_CONFIG = ".codex/config.toml";
const codexRegistration = async (context: HostContext): Promise<Result<{ readonly old: string | null; readonly addition: string }>> => {
  const path = join(context.project, CODEX_CONFIG);
  const [old, parsed] = await Promise.all([readText(path), readToml(context.python, path, context.project)]);
  const addition = parsed.ok ? codexToolingRegistration(parsed.value, { project: context.project, marketplace: context.tools,
    ...(context.knowledgeCommand === undefined ? {} : { knowledgeCommand: context.knowledgeCommand }) }) : undefined;
  return !old.ok ? old : !parsed.ok ? parsed : addition?.ok !== true ? conflict("Codex", path) : ok({ old: old.value, addition: addition.value });
};
const codexCatalog = async (context: HostContext, plugins: readonly HostPlugin[]): Promise<Result<string>> => {
  const path = join(context.tools, ".agents/plugins/marketplace.json");
  const [old, parsed] = await Promise.all([readText(path), nodeProjectFiles.read(path)()]);
  const merged = parsed.ok ? mergeCodexMarketplace(parsed.value, plugins.map(({ name }) => name)) : undefined;
  return !old.ok ? old : !parsed.ok ? parsed : merged?.ok !== true ? conflict("Codex marketplace", path)
    : writeText(context.project, path, JSON.stringify(merged.value, null, 2), old.value);
};
const codexSkills = (reply: unknown): Result<readonly DiscoveredSkill[]> => {
  const result = object(reply) && object(reply.result) ? reply.result : {};
  const entries = Array.isArray(result.data) ? result.data : [];
  const errors = entries.flatMap((entry: unknown) => object(entry) && Array.isArray(entry.errors) ? entry.errors : []);
  return errors.length > 0 ? fail("host-skill-errors", "The host reported skill discovery errors.", "Correct the reported skill installation through its supported installer; then repeat discovery.")
    : ok(entries.flatMap((entry: unknown) => object(entry) && Array.isArray(entry.skills) ? entry.skills : [])
      .filter((skill: unknown): skill is DiscoveredSkill => object(skill) && typeof skill.name === "string" && typeof skill.path === "string"));
};
const CODEX = Object.freeze<HostTooling>({
  label: "Codex", vendor: "codex", frameworkDir: "plugins", manifest: ".codex-plugin/plugin.json", bareSkills: ".agents/skills",
  catalog: codexCatalog,
  register: (context) => codexRegistration(context).then((found) => !found.ok ? found : found.value.addition === "" ? ok(CODEX_CONFIG)
    : writeText(context.project, join(context.project, CODEX_CONFIG), `${found.value.old ?? ""}\n${found.value.addition}\n`, found.value.old)),
  registered: (context) => codexRegistration(context).then((found) => found.ok ? ok(found.value.addition === "") : found),
  activate: (context, plugin) => command("codex", CODEX_TOOLING.install(plugin.name), context.project),
  discover: (context) => hostRequest(context.project, CODEX_TOOLING.discovery(context.project)).then((reply) => reply.ok ? codexSkills(reply.value) : reply),
});

// Claude Code: a directory marketplace declared in project settings; plugins installed at project scope load in place.
const CLAUDE_SETTINGS = ".claude/settings.json";
const CLAUDE_MANIFEST = ".claude-plugin/plugin.json";
const declaresTools = (context: HostContext, declared: unknown): boolean =>
  record(record(declared).source).source === "directory" && record(record(declared).source).path === context.tools;
const claudeCatalog = async (context: HostContext, plugins: readonly HostPlugin[]): Promise<Result<string>> => {
  const path = join(context.tools, ".claude-plugin/marketplace.json");
  const [old, parsed] = await Promise.all([readText(path), readJson(path)]);
  const current = parsed.ok ? record(parsed.value) : {};
  const entries = Array.isArray(current.plugins) ? current.plugins.map(record) : [];
  const desired = plugins.map(({ name, root }) => ({ name, source: `./${relative(context.tools, root)}` }));
  const clash = parsed.ok && (parsed.value !== null && (!object(parsed.value) || current.name !== MARKETPLACE) || desired.some((entry) =>
    entries.some((existing) => existing.name === entry.name && existing.source !== entry.source)));
  const merged = { ...current, name: MARKETPLACE, owner: current.owner ?? { name: "Unified Plugin Framework" },
    plugins: [...entries, ...desired.filter((entry) => !entries.some((existing) => existing.name === entry.name))] };
  return !old.ok ? old : !parsed.ok ? parsed : clash ? conflict("Claude Code marketplace", path)
    : JSON.stringify(merged) === JSON.stringify(parsed.value) ? ok(path) : writeText(context.project, path, `${JSON.stringify(merged, null, 2)}\n`, old.value);
};
const claudeMarketplaceDeclared = (context: HostContext): Promise<Result<"absent" | "declared">> =>
  readJson(join(context.project, CLAUDE_SETTINGS)).then((parsed) => {
    const declared = parsed.ok ? record(record(parsed.value).extraKnownMarketplaces)[MARKETPLACE] : undefined;
    return !parsed.ok ? parsed : declared === undefined ? ok("absent")
      : declaresTools(context, declared) ? ok("declared") : conflict("Claude Code", CLAUDE_SETTINGS);
  });
const claudeServer = (context: HostContext): Promise<Result<string>> => context.knowledgeCommand === undefined ? Promise.resolve(ok(".mcp.json"))
  : writeEntry(context.project, join(context.project, ".mcp.json"), "mcpServers", SERVER, knowledgeEntry(context), "Claude Code MCP");
const claudeRegister = (context: HostContext): Promise<Result<string>> => claudeMarketplaceDeclared(context).then((state) =>
  !state.ok ? state : state.value === "declared" ? claudeServer(context)
    : command("claude", ["plugin", "marketplace", "add", context.tools, "--scope", "project", "--json"], context.project)
      .then((added) => added.ok ? claudeServer(context) : added));
const claudeInstalled = (context: HostContext, raw: unknown): readonly HostPlugin[] => (Array.isArray(raw) ? raw : []).map(record)
  .filter((entry) => typeof entry.id === "string" && entry.id.endsWith(`@${MARKETPLACE}`) && entry.enabled === true
    && typeof entry.projectPath === "string" && resolve(entry.projectPath) === resolve(context.project))
  .flatMap((entry) => {
    const root = typeof entry.readFromFolder === "string" ? entry.readFromFolder : entry.installPath;
    return typeof root === "string" ? [{ name: String(entry.id).slice(0, -MARKETPLACE.length - 1), root }] : [];
  });
const CLAUDE = Object.freeze<HostTooling>({
  label: "Claude Code", vendor: "claude", frameworkDir: "hosts/claude", manifest: CLAUDE_MANIFEST, bareSkills: ".claude/skills",
  catalog: claudeCatalog,
  register: claudeRegister,
  registered: (context) => Promise.all([claudeMarketplaceDeclared(context), context.knowledgeCommand === undefined ? Promise.resolve(ok(true))
    : hasEntry(join(context.project, ".mcp.json"), "mcpServers", SERVER, knowledgeEntry(context))])
    .then(([market, server]) => !market.ok ? market : !server.ok ? server : ok(market.value === "declared" && server.value)),
  activate: (context, plugin) => command("claude", ["plugin", "install", `${plugin.name}@${MARKETPLACE}`, "--scope", "project", "--json"], context.project),
  discover: (context) => command("claude", ["plugin", "list", "--json"], context.project).then((listed) => {
    const parsed = listed.ok ? parseJson(listed.value) : listed;
    return parsed.ok ? ok([...claudeInstalled(context, parsed.value).flatMap((plugin) => pluginSkills(plugin, CLAUDE_MANIFEST)), ...bareSkills(context, ".claude/skills")]) : parsed;
  }),
});

// Cursor: no project-scoped plugins or install command; it loads each plugin linked under ~/.cursor/plugins/local.
const CURSOR_MANIFEST = ".cursor-plugin/plugin.json";
const cursorLocal = (context: HostContext): string => join(context.home, ".cursor/plugins/local");
/** Boundary: the one write outside the project. A link this project owns is reused; anything else is preserved. */
const cursorLink = (context: HostContext, plugin: HostPlugin): Promise<Result<string>> => {
  const link = join(cursorLocal(context), plugin.name);
  return lstat(link).then((stat) => stat.isSymbolicLink() ? readlink(link).then((target) => resolve(cursorLocal(context), target) === resolve(plugin.root) ? ok(link)
    : fail("cursor-plugin-conflict", `Cursor already loads a different ${plugin.name} from ${target}.`, `Preserve it; remove or move ${link} yourself if this project should provide ${plugin.name}, then rerun setup.`))
    : fail("cursor-plugin-conflict", `Cursor already has an unmanaged ${plugin.name} plugin.`, `Preserve it; move ${link} yourself if this project should provide ${plugin.name}, then rerun setup.`))
    .catch((error: unknown) => object(error) && error.code === "ENOENT"
      ? mkdir(cursorLocal(context), { recursive: true }).then(() => symlink(plugin.root, link, "dir")).then(() => ok(link)).catch(() => setupFailure(`Could not link ${plugin.name} into Cursor.`))
      : setupFailure(`Could not inspect Cursor's local plugin ${plugin.name}.`));
};
const cursorLinked = (context: HostContext): Promise<readonly HostPlugin[]> => readdir(cursorLocal(context)).catch(() => [] as string[])
  .then((names) => Promise.all(names.map((name) => readlink(join(cursorLocal(context), name))
    .then((target): readonly HostPlugin[] => [{ name, root: resolve(cursorLocal(context), target) }]).catch((): readonly HostPlugin[] => []))))
  .then((plugins) => plugins.flat().filter(({ root }) => !relative(context.tools, root).startsWith("..")));
const CURSOR = Object.freeze<HostTooling>({
  label: "Cursor", vendor: "cursor", frameworkDir: "hosts/cursor", manifest: CURSOR_MANIFEST, bareSkills: ".cursor/skills",
  catalog: () => Promise.resolve(ok("Cursor loads linked local plugins without a catalog.")),
  register: (context: HostContext) => context.knowledgeCommand === undefined ? Promise.resolve(ok(".cursor/mcp.json"))
    : writeEntry(context.project, join(context.project, ".cursor/mcp.json"), "mcpServers", SERVER, knowledgeEntry(context), "Cursor MCP"),
  registered: (context: HostContext) => context.knowledgeCommand === undefined ? Promise.resolve(ok(true))
    : hasEntry(join(context.project, ".cursor/mcp.json"), "mcpServers", SERVER, knowledgeEntry(context)),
  activate: cursorLink,
  discover: (context: HostContext) => cursorLinked(context).then((plugins) => ok([...plugins.flatMap((plugin) => pluginSkills(plugin, CURSOR_MANIFEST)), ...bareSkills(context, ".cursor/skills")])),
});

export const HOSTS: Readonly<Record<HostName, HostTooling>> = Object.freeze({ codex: CODEX, claude: CLAUDE, cursor: CURSOR });

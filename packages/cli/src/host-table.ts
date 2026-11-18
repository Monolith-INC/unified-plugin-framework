import { join, posix, relative, sep } from "node:path";
import { CLAUDE_TOOLING, claudeDeclaration, claudeInstalledPlugins, claudeMarketplaceName, mergeClaudeMarketplace, mergeClaudeServer, sameServer, type ClaudeServerEntry, type JsonEdit } from "@agent-plugins/adapter-claude/tooling";
import { CODEX_TOOLING, codexToolingRegistration, mergeCodexMarketplace } from "@agent-plugins/adapter-codex";
import type { Result as PlanResult } from "@agent-plugins/compiler";
import { KNOWLEDGE_SERVER } from "@agent-plugins/core";
import { fail, object, ok, parseJson, type Result } from "@agent-plugins/project";
import type { HostName } from "./host-names.js";
import { NODE_PLUGIN_FACTS_IO, skillNames } from "./plugin-reader.js";
import { codexAppServerRequest, command } from "./tooling-process.js";
import { readText, readToml, writeText } from "./tooling-files.js";

export interface DiscoveredSkill { readonly name: string; readonly path: string }
/** A plugin directory the host should load, under the name its skills are namespaced by. */
export interface HostPlugin { readonly name: string; readonly root: string; readonly kind: "framework" | "dependency" }
/** Where one project's setup lives; `canonical` is the project's real path, which hosts record installs under. */
export interface HostContext {
  readonly project: string;
  readonly canonical: string;
  readonly tools: string;
  readonly python: string;
  readonly knowledgeCommand?: string;
}

/** One host's names, paths and commands; setup steps stay host-neutral and ask this record. */
export interface HostTooling {
  readonly label: string;
  /** What setup changes for this host, as the installer shows it before asking to apply. */
  readonly changes: string;
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

const record = (value: unknown): Readonly<Record<string, unknown>> => object(value) ? value : {};
const conflict = (label: string, path: string, detail: string): Result<never> => fail("host-configuration-conflict",
  `Existing ${label} configuration in ${path} differs from this setup: ${detail}`, "Preserve it; reconcile that entry, then rerun setup.");
const planDetail = (planned: PlanResult<unknown>): string => planned.ok ? "" : planned.diagnostics.map(({ message }) => message).join(" ");
/** One read of a JSON file: its text guards the later write, its value is `null` when the file is absent. */
interface JsonDocument { readonly text: string | null; readonly value: unknown }
const readDocument = (path: string): Promise<Result<JsonDocument>> => readText(path).then((read) => !read.ok ? read
  : read.value === null ? ok({ text: null, value: null }) : withText(read.value, parseJson(read.value)));
const withText = (text: string, parsed: Result<unknown>): Result<JsonDocument> => parsed.ok ? ok({ text, value: parsed.value }) : parsed;
const written = (project: string, path: string, previous: string | null, edit: JsonEdit): Promise<Result<string>> => {
  switch (edit.kind) {
    case "unchanged": return Promise.resolve(ok(path));
    case "write": return writeText(project, path, `${JSON.stringify(edit.document, null, 2)}\n`, previous);
  }
};
/** Read once, plan the edit purely, then write only a changed document. */
const editJson = (project: string, path: string, label: string, plan: (value: unknown) => PlanResult<JsonEdit>): Promise<Result<string>> =>
  readDocument(path).then((document) => {
    const planned = document.ok ? plan(document.value.value) : undefined;
    return !document.ok ? document : planned?.ok !== true ? conflict(label, path, planned === undefined ? "" : planDetail(planned))
      : written(project, path, document.value.text, planned.value);
  });
const knowledge = <A>(context: HostContext, absent: A, present: (command: string) => Promise<Result<A>>): Promise<Result<A>> =>
  context.knowledgeCommand === undefined ? Promise.resolve(ok(absent)) : present(context.knowledgeCommand);

/** Skills a plugin directory exposes through its host manifest's `skills` path. */
const pluginSkills = (root: string, name: string, manifest: string): readonly DiscoveredSkill[] => {
  const raw = NODE_PLUGIN_FACTS_IO.readJson(join(root, manifest));
  const declared = raw.kind === "value" ? record(raw.value).skills : undefined;
  const dir = join(root, typeof declared === "string" ? declared : "skills");
  return skillNames(dir).map((skill) => ({ name: `${name}:${skill}`, path: join(dir, skill, "SKILL.md") }));
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
  return !old.ok ? old : !parsed.ok ? parsed : addition?.ok !== true ? conflict("Codex", path, addition === undefined ? "" : planDetail(addition))
    : ok({ old: old.value, addition: addition.value });
};
const codexCatalog = (context: HostContext, plugins: readonly HostPlugin[]): Promise<Result<string>> => {
  const path = join(context.tools, ".agents/plugins/marketplace.json");
  return readDocument(path).then((document) => {
    const merged = document.ok ? mergeCodexMarketplace(document.value.value, plugins.map(({ name }) => name)) : undefined;
    return !document.ok ? document : merged?.ok !== true ? conflict("Codex marketplace", path, merged === undefined ? "" : planDetail(merged))
      : writeText(context.project, path, JSON.stringify(merged.value, null, 2), document.value.text);
  });
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
  label: "Codex", changes: "Codex configuration (.codex/config.toml) and plugin registrations",
  frameworkDir: "plugins", manifest: ".codex-plugin/plugin.json", bareSkills: ".agents/skills",
  catalog: codexCatalog,
  register: (context) => codexRegistration(context).then((found) => !found.ok ? found : found.value.addition === "" ? ok(CODEX_CONFIG)
    : writeText(context.project, join(context.project, CODEX_CONFIG), `${found.value.old ?? ""}\n${found.value.addition}\n`, found.value.old)),
  registered: (context) => codexRegistration(context).then((found) => found.ok ? ok(found.value.addition === "") : found),
  activate: (context, plugin) => command("codex", CODEX_TOOLING.install(plugin.name), context.project),
  discover: (context) => codexAppServerRequest(context.project, CODEX_TOOLING.discovery(context.project)).then((reply) => reply.ok ? codexSkills(reply.value) : reply),
});

// Claude Code: a directory marketplace named for this project, declared and installed at local scope; plugins load in place.
const claudeMarketplace = (context: HostContext): string => claudeMarketplaceName(context.canonical);
const serverEntry = (context: HostContext, knowledgeCommand: string): ClaudeServerEntry => ({ command: knowledgeCommand, args: ["--project", context.project] });
const claudeCatalog = (context: HostContext, plugins: readonly HostPlugin[]): Promise<Result<string>> =>
  editJson(context.project, join(context.tools, CLAUDE_TOOLING.catalog), "Claude Code marketplace", (value) => mergeClaudeMarketplace(value, claudeMarketplace(context),
    plugins.map(({ name, root }) => ({ name, source: catalogSource(context.tools, root) }))));
/** Claude Code reads catalog sources as `./`-relative paths with forward slashes on every platform. */
const catalogSource = (tools: string, root: string): string => `./${relative(tools, root).split(sep).join(posix.sep)}`;
const declared = (context: HostContext, settings: unknown): Result<boolean> => {
  switch (claudeDeclaration(settings, claudeMarketplace(context), context.tools)) {
    case "absent": return ok(false);
    case "declared": return ok(true);
    case "conflict": return conflict("Claude Code", CLAUDE_TOOLING.settings, `marketplace ${claudeMarketplace(context)} is declared for another folder.`);
  }
};
const claudeDeclared = (context: HostContext): Promise<Result<boolean>> =>
  readDocument(join(context.project, CLAUDE_TOOLING.settings)).then((document) => document.ok ? declared(context, document.value.value) : document);
const claudeServer = (context: HostContext): Promise<Result<string>> => knowledge(context, CLAUDE_TOOLING.servers, (knowledgeCommand) =>
  editJson(context.project, join(context.project, CLAUDE_TOOLING.servers), "Claude Code MCP", (value) => mergeClaudeServer(value, serverEntry(context, knowledgeCommand))));
const claudeServerRegistered = (context: HostContext): Promise<Result<boolean>> => knowledge(context, true, (knowledgeCommand) =>
  readDocument(join(context.project, CLAUDE_TOOLING.servers)).then((document) => document.ok
    ? ok(sameServer(record(record(document.value.value).mcpServers)[KNOWLEDGE_SERVER], serverEntry(context, knowledgeCommand))) : document));
const claudeRegister = (context: HostContext): Promise<Result<string>> => claudeDeclared(context).then((known) => !known.ok ? known
  : known.value ? claudeServer(context)
    : command("claude", CLAUDE_TOOLING.addMarketplace(context.tools), context.project).then((added) => added.ok ? claudeServer(context) : added));
const claudeSkills = (context: HostContext, listed: string): Result<readonly DiscoveredSkill[]> => {
  const parsed = parseJson(listed);
  return parsed.ok ? ok([...claudeInstalledPlugins(parsed.value, context.canonical, claudeMarketplace(context))
    .flatMap(({ name, root }) => pluginSkills(root, name, CLAUDE_TOOLING.manifest)), ...bareSkills(context, CLAUDE_TOOLING.skills)]) : parsed;
};
const CLAUDE = Object.freeze<HostTooling>({
  label: "Claude Code", changes: `Claude Code local settings (${CLAUDE_TOOLING.settings}), ${CLAUDE_TOOLING.servers}, ${CLAUDE_TOOLING.skills} and plugin installs for this project`,
  frameworkDir: "hosts/claude", manifest: CLAUDE_TOOLING.manifest, bareSkills: CLAUDE_TOOLING.skills,
  catalog: claudeCatalog,
  register: claudeRegister,
  registered: (context) => Promise.all([claudeDeclared(context), claudeServerRegistered(context)])
    .then(([market, server]) => !market.ok ? market : !server.ok ? server : ok(market.value && server.value)),
  activate: (context, plugin) => command("claude", CLAUDE_TOOLING.install(plugin.name, claudeMarketplace(context)), context.project),
  discover: (context) => command("claude", CLAUDE_TOOLING.list, context.project).then((listed) => listed.ok ? claudeSkills(context, listed.value) : listed),
});

export const HOSTS: Readonly<Record<HostName, HostTooling>> = Object.freeze({ codex: CODEX, claude: CLAUDE });

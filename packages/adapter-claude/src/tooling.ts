import { failure, sha256, success, type JsonValue, type Result } from "@agent-plugins/compiler";
import { KNOWLEDGE_SERVER } from "@agent-plugins/core";

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
const isRecord = (value: unknown): boolean => typeof value === "object" && value !== null && !Array.isArray(value);

/** A plugin listed in the project catalog, with its folder relative to the catalog root. */
export interface ClaudeCatalogEntry { readonly name: string; readonly source: string }
export interface ClaudeServerEntry { readonly command: string; readonly args: readonly string[] }
/** A plugin Claude Code reports enabled for the project, and the folder it reads it from. */
export interface ClaudeInstalled { readonly name: string; readonly root: string }
/** How setup changes one JSON document. */
export type JsonEdit = { readonly kind: "unchanged" } | { readonly kind: "write"; readonly document: JsonValue };
export type ClaudeDeclaration = "absent" | "declared" | "conflict";

/**
 * Claude Code owns its file names and command protocol. Local scope keeps this machine's paths out of shared
 * project settings.
 */
export const CLAUDE_TOOLING = Object.freeze({
  settings: ".claude/settings.local.json",
  servers: ".mcp.json",
  catalog: ".claude-plugin/marketplace.json",
  manifest: ".claude-plugin/plugin.json",
  skills: ".claude/skills",
  addMarketplace: (root: string): readonly string[] => ["plugin", "marketplace", "add", root, "--scope", "local", "--json"],
  install: (name: string, marketplace: string): readonly string[] => ["plugin", "install", `${name}@${marketplace}`, "--scope", "local", "--json"],
  list: Object.freeze(["plugin", "list", "--json"]) as readonly string[],
});

/** Claude Code keeps one marketplace per name for the whole user, so each project's catalog is named after its real path. */
export const claudeMarketplaceName = (project: string): string => `upf-${sha256(project).slice(0, 12)}`;

const OWNER = Object.freeze({ name: "Unified Plugin Framework" });
const catalogConflict = (existing: unknown, marketplace: string, entries: readonly ClaudeCatalogEntry[]): boolean => {
  const listed = record(existing).plugins;
  return existing !== null && (!isRecord(existing) || record(existing).name !== marketplace || !Array.isArray(listed)
    || listed.some((old: unknown) => !isRecord(old) || typeof record(old).name !== "string")
    || entries.some((entry) => listed.some((old: unknown) => record(old).name === entry.name && record(old).source !== entry.source)));
};
/** Earlier entries and unrelated catalog fields are kept; a plugin already listed from another folder is a conflict. */
export const mergeClaudeMarketplace = (existing: unknown, marketplace: string, entries: readonly ClaudeCatalogEntry[]): Result<JsonEdit> => {
  const current = record(existing);
  const listed: readonly unknown[] = Array.isArray(current.plugins) ? current.plugins : [];
  const added = entries.filter((entry) => !listed.some((old) => record(old).name === entry.name));
  return catalogConflict(existing, marketplace, entries)
    ? failure({ severity: "error", code: "claude.marketplace.conflict", message: `Catalog ${marketplace} lists a plugin from another folder, or is not a ${marketplace} catalog.` })
    : added.length === 0 && existing !== null ? success({ kind: "unchanged" })
      : success({ kind: "write", document: { ...current, name: marketplace, owner: current.owner ?? OWNER, plugins: [...listed, ...added] } as unknown as JsonValue });
};

/** Whether project settings already declare this project's marketplace, at this tools folder. */
export const claudeDeclaration = (settings: unknown, marketplace: string, root: string): ClaudeDeclaration => {
  const declared = record(record(settings).extraKnownMarketplaces)[marketplace];
  const source = record(record(declared).source);
  return declared === undefined ? "absent" : source.source === "directory" && source.path === root ? "declared" : "conflict";
};

/** The isolated runtime every framework checkout installs, wherever the checkout lives. */
const OWNED_COMMAND = "/.project-knowledge/runtime/bin/upf-project-knowledge";
export const sameServer = (old: unknown, entry: ClaudeServerEntry): boolean =>
  record(old).command === entry.command && JSON.stringify(record(old).args) === JSON.stringify(entry.args);
const ownedServer = (old: unknown): boolean => {
  const command = record(old).command;
  return typeof command === "string" && command.endsWith(OWNED_COMMAND);
};
const serverMalformed = (existing: unknown): boolean => {
  const servers = record(existing).mcpServers;
  const old = record(servers)[KNOWLEDGE_SERVER];
  return existing !== null && !isRecord(existing) || servers !== undefined && !isRecord(servers) || old !== undefined && !isRecord(old);
};
/** An entry from another checkout of this framework is repointed here; any other different entry is preserved. */
export const mergeClaudeServer = (existing: unknown, entry: ClaudeServerEntry): Result<JsonEdit> => {
  const current = record(existing);
  const servers = record(current.mcpServers);
  const old = servers[KNOWLEDGE_SERVER];
  return serverMalformed(existing) || old !== undefined && !sameServer(old, entry) && !ownedServer(old)
    ? failure({ severity: "error", code: "claude.server.conflict", message: `Server ${KNOWLEDGE_SERVER} is configured with another command.` })
    : old !== undefined && sameServer(old, entry) ? success({ kind: "unchanged" })
      : success({ kind: "write", document: { ...current, mcpServers: { ...servers,
        [KNOWLEDGE_SERVER]: { ...record(old), command: entry.command, args: [...entry.args] } } } as unknown as JsonValue });
};

/** Plugins from this project's marketplace that Claude Code reports enabled for exactly this project. */
export const claudeInstalledPlugins = (raw: unknown, project: string, marketplace: string): readonly ClaudeInstalled[] =>
  (Array.isArray(raw) ? raw : []).map(record)
    .filter((entry) => entry.enabled === true && entry.projectPath === project && typeof entry.id === "string" && entry.id.endsWith(`@${marketplace}`))
    .flatMap((entry) => {
      const root = typeof entry.readFromFolder === "string" ? entry.readFromFolder : entry.installPath;
      return typeof root === "string" ? [{ name: String(entry.id).slice(0, -marketplace.length - 1), root }] : [];
    });

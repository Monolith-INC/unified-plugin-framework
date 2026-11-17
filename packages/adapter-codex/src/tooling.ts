import { failure, success, type JsonValue, type Result } from "@agent-plugins/compiler";

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
const isRecord = (value: unknown): boolean => typeof value === "object" && value !== null && !Array.isArray(value);

export interface CodexToolingInput {
  readonly project: string;
  readonly marketplace: string;
  readonly knowledgeCommand?: string;
}

/** Codex owns its configuration names, plugin namespacing and command protocol. */
export const CODEX_TOOLING = Object.freeze({
  marketplace: "upf-project",
  server: "project-knowledge",
  install: (name: string): readonly string[] => ["plugin", "add", `${name}@upf-project`, "--json"],
  discovery: (project: string) => ({ method: "skills/list", params: { cwds: [project], forceReload: true } }),
  skillManifest: (name: string, version: string): JsonValue => ({ name, version, skills: "./skills/" }),
  marketplaceManifest: (names: readonly string[]): JsonValue => ({ name: "upf-project", plugins: names.map((name) => ({
    name, source: { source: "local", path: `./plugins/${name}` }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  })) }),
});

/** Add accepted plugins without dropping earlier workflows or unrelated catalog metadata. */
export const mergeCodexMarketplace = (existing: unknown, names: readonly string[]): Result<JsonValue> => {
  const current = record(existing);
  const entries = Array.isArray(current.plugins) ? current.plugins : [];
  const desired = names.map((name) => ({ name, source: { source: "local", path: `./plugins/${name}` },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" } }));
  const conflict = existing !== null && (!isRecord(existing) || current.name !== CODEX_TOOLING.marketplace || !Array.isArray(current.plugins))
    || entries.some((entry: unknown) => !isRecord(entry) || typeof record(entry).name !== "string")
    || desired.some((entry) => entries.some((old: unknown) => record(old).name === entry.name
      && (record(record(old).source).path !== entry.source.path || record(record(old).source).source !== entry.source.source)));
  return conflict ? failure({ severity: "error", code: "codex.marketplace.conflict", message: "Existing marketplace entries differ from the accepted plugin sources. Preserve the catalog and reconcile the named entries before resuming." })
    : success({ ...current, name: CODEX_TOOLING.marketplace,
      plugins: [...entries, ...desired.filter((entry) => !entries.some((old: unknown) => record(old).name === entry.name))] } as JsonValue);
};

/** Append only missing owned tables; a conflicting existing entry is preserved with a concrete recovery. */
export const codexToolingRegistration = (raw: unknown, desired: CodexToolingInput): Result<string> => {
  const current = record(raw);
  const marketplace = record(record(current.marketplaces)[CODEX_TOOLING.marketplace]);
  const server = record(record(current.mcp_servers)[CODEX_TOOLING.server]);
  const marketplaceExists = Object.keys(marketplace).length > 0;
  const serverExists = Object.keys(server).length > 0;
  const malformed = [current.marketplaces, current.mcp_servers].some((value) => value !== undefined && !isRecord(value))
    || [record(current.marketplaces)[CODEX_TOOLING.marketplace], record(current.mcp_servers)[CODEX_TOOLING.server]]
      .some((value) => value !== undefined && (!isRecord(value) || Object.keys(record(value)).length === 0));
  const conflict = malformed || (marketplaceExists && (marketplace.source !== desired.marketplace || marketplace.source_type !== "local"))
    || (desired.knowledgeCommand !== undefined && serverExists && (server.command !== desired.knowledgeCommand
      || JSON.stringify(server.args) !== JSON.stringify(["--project", desired.project]) || server.enabled === false));
  return conflict ? failure({ severity: "error", code: "codex.tooling.conflict",
    message: "Existing Codex tooling configuration differs. Preserve it; reconcile the upf-project marketplace or project-knowledge server before resuming setup." })
    : success([
      ...(marketplaceExists ? [] : [`[marketplaces.upf-project]\nsource_type = "local"\nsource = ${JSON.stringify(desired.marketplace)}`]),
      ...(desired.knowledgeCommand === undefined || serverExists ? [] : [`[mcp_servers.project-knowledge]\ncommand = ${JSON.stringify(desired.knowledgeCommand)}\nargs = ${JSON.stringify(["--project", desired.project])}`]),
    ].join("\n\n"));
};

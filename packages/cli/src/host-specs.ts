import { CLAUDE_ADAPTER_VERSION, CLAUDE_SCHEMA_EVIDENCE, CLAUDE_SCHEMA_VERSION } from "@agent-plugins/adapter-claude";
import { CODEX_ADAPTER_VERSION, CODEX_SCHEMA_EVIDENCE, CODEX_SCHEMA_VERSION } from "@agent-plugins/adapter-codex";
import { SUPPORTED_SCHEMA_VERSION } from "@agent-plugins/core";
import { object } from "@agent-plugins/project";
import type { HostName } from "./host-names.js";

/** Project-local receipt recording the Agent Plugins spec version and pinned host spec versions applied. */
export const HOST_SPECS_FILE = ".agent-plugins/host-specs.json" as const;

export interface HostSpecContract {
  readonly host: HostName;
  readonly adapterVersion: string;
  readonly vendorSchemaVersion: string;
  readonly skillsDir: string;
  readonly hooksFile: string;
  readonly includeStopHook: boolean;
  readonly sources: readonly string[];
}

export const HOST_SPECS: Readonly<Record<HostName, HostSpecContract>> = Object.freeze({
  codex: Object.freeze({
    host: "codex" as const,
    adapterVersion: CODEX_ADAPTER_VERSION,
    vendorSchemaVersion: CODEX_SCHEMA_VERSION,
    skillsDir: ".agents/skills",
    hooksFile: ".codex/hooks.json",
    includeStopHook: true,
    sources: CODEX_SCHEMA_EVIDENCE,
  }),
  claude: Object.freeze({
    host: "claude" as const,
    adapterVersion: CLAUDE_ADAPTER_VERSION,
    vendorSchemaVersion: CLAUDE_SCHEMA_VERSION,
    skillsDir: ".claude/skills",
    hooksFile: ".claude/settings.local.json",
    includeStopHook: true,
    sources: CLAUDE_SCHEMA_EVIDENCE,
  }),
});

const specEntry = (spec: HostSpecContract): Readonly<Record<string, unknown>> => ({
  adapterVersion: spec.adapterVersion,
  vendorSchemaVersion: spec.vendorSchemaVersion,
  skillsDir: spec.skillsDir,
  hooksFile: spec.hooksFile,
  sources: [...spec.sources],
});

/** Purely merge one host's pinned spec receipt into `.agent-plugins/host-specs.json`, preserving other hosts. */
export const mergeHostSpecReceipt = (existing: unknown, host: HostName): Readonly<Record<string, unknown>> => {
  const base = object(existing) ? existing : {};
  const existingHosts = object(base.hosts) ? base.hosts : {};
  return {
    ...base,
    schemaVersion: 1,
    agentPluginsSpec: SUPPORTED_SCHEMA_VERSION,
    hosts: {
      ...existingHosts,
      [host]: specEntry(HOST_SPECS[host]),
    },
  };
};

/** Pure check that `.agent-plugins/host-specs.json` matches this CLI's Agent Plugins and host spec versions. */
export const hostSpecMatches = (existing: unknown, host: HostName): boolean => {
  if (!object(existing) || existing.schemaVersion !== 1 || existing.agentPluginsSpec !== SUPPORTED_SCHEMA_VERSION) {
    return false;
  }
  const hosts = object(existing.hosts) ? existing.hosts : null;
  const entry = hosts !== null && object(hosts[host]) ? hosts[host] : null;
  const expected = HOST_SPECS[host];
  return entry !== null
    && entry.adapterVersion === expected.adapterVersion
    && entry.vendorSchemaVersion === expected.vendorSchemaVersion
    && entry.skillsDir === expected.skillsDir
    && entry.hooksFile === expected.hooksFile
    && Array.isArray(entry.sources)
    && JSON.stringify(entry.sources) === JSON.stringify([...expected.sources]);
};

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Parse simple top-level scalar fields (`name`, `description`) from a SKILL.md YAML frontmatter block. */
export const parseSkillFrontmatter = (content: string): Readonly<Record<string, string>> | null => {
  const match = FRONTMATTER_BLOCK.exec(content);
  if (match === null) return null;
  const body = match[1] ?? "";
  return Object.fromEntries(
    body.split(/\r?\n/u).flatMap((line) => {
      const parsed = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
      if (parsed === null) return [];
      const key = parsed[1] ?? "";
      const raw = (parsed[2] ?? "").trim();
      const unquoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
      return [[key, unquoted] as const];
    }),
  );
};

/** Whether a materialized SKILL.md has valid Agent Skills frontmatter matching its expected directory name. */
export const hasValidSkillFrontmatter = (content: string, expectedName: string): boolean => {
  const fields = parseSkillFrontmatter(content);
  return fields !== null
    && SKILL_NAME_PATTERN.test(expectedName)
    && !expectedName.includes("--")
    && fields.name === expectedName
    && typeof fields.description === "string"
    && fields.description.trim().length > 0;
};

/**
 * Rewrite only the YAML frontmatter `name:` field on a disambiguated host copy (e.g. when a dependency skill name
 * collides with a framework contract skill). Original dependency sources under `.upf-tools/plugins/<name>/source`
 * remain untouched.
 */
export const rewriteSkillFrontmatterName = (content: string, targetName: string): string => {
  const match = FRONTMATTER_BLOCK.exec(content);
  if (match === null) return content;
  const block = match[0];
  const updated = /^name:\s*.*$/mu.test(block)
    ? block.replace(/^name:\s*.*$/mu, `name: ${targetName}`)
    : block.replace(/^---(\r?\n)/u, `---$1name: ${targetName}$1`);
  return `${updated}${content.slice(block.length)}`;
};

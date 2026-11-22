import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fail, nodeProjectFiles, ok, type Result } from "@agent-plugins/project";
import type { HostName } from "./host-names.js";
import { hasValidSkillFrontmatter, HOST_SPECS, HOST_SPECS_FILE, hostSpecMatches, mergeHostSpecReceipt, type HostSpecContract } from "./host-specs.js";
import { skillNames } from "./plugin-reader.js";
import { directory, readConfinedText, readText, safePath, writeText } from "./tooling-files.js";
import type { HostCli } from "./tooling-host-cli.js";

export interface DiscoveredSkill {
  readonly name: string;
  readonly path: string;
  readonly scope?: string;
  readonly pluginId?: string | null;
}

/** A plugin directory the host should load, under the name its skills are owned by. */
export interface HostPlugin { readonly name: string; readonly root: string; readonly kind: "framework" | "dependency" }

/**
 * Where one project's setup lives. `canonical` is the project's real path; `claudeState` is retained for optional
 * external tooling compatibility and is never mutated during zero-CLI installation.
 */
export interface HostContext {
  readonly program?: string;
  readonly project: string;
  readonly canonical: string;
  readonly claudeState: string;
  readonly tools: string;
  readonly python: string;
  readonly knowledgeCommand?: string;
  readonly codexQuestions?: boolean;
  /** Time-limit multiple for optional commands; set only when retrying a timeout. */
  readonly patience?: number;
}

/** What setup needs from the user's environment, read once at the program edge. */
export interface HostEnvironment { readonly claudeState: string; readonly hostCli?: HostCli; readonly patience?: number }

/** One host's spec-driven project layout and deterministic zero-CLI operations. */
export interface HostTooling {
  readonly label: string;
  /** What setup changes for this host, as the installer shows it before asking to apply. */
  readonly changes: string;
  /** Legacy host payload folder relative to tools root (retained for path helpers). */
  readonly frameworkDir: string;
  /** The host manifest path defined by this host's spec. */
  readonly manifest: string;
  /** Project folder the host reads project-local skills from. */
  readonly bareSkills: string;
  /** Pinned host specification contract recorded in `.agent-plugins/host-specs.json`. */
  readonly spec: HostSpecContract;
  readonly catalog: (context: HostContext, plugins: readonly HostPlugin[]) => Promise<Result<string>>;
  readonly register: (context: HostContext) => Promise<Result<string>>;
  readonly registered: (context: HostContext) => Promise<Result<boolean>>;
  readonly activate: (context: HostContext, plugin: HostPlugin) => Promise<Result<string>>;
  readonly discover: (context: HostContext) => Promise<Result<readonly DiscoveredSkill[]>>;
}

const registerSpec = async (context: HostContext, host: HostName): Promise<Result<string>> => {
  const path = join(context.project, HOST_SPECS_FILE);
  if (!await safePath(context.project, path)) {
    return fail("symlink-escape", "The host specification receipt path escapes the project or follows a symbolic link.",
      "Preserve the linked path and choose an unlinked location inside the project.");
  }
  const dir = await directory(context.project, dirname(path));
  if (!dir.ok) return dir;
  const raw = await nodeProjectFiles.read(path)();
  if (!raw.ok) return raw;
  const next = mergeHostSpecReceipt(raw.value, host);
  return nodeProjectFiles.write(path, next, raw.value)().then((saved) => saved.ok ? ok(path) : saved);
};

const specRegistered = async (context: HostContext, host: HostName): Promise<Result<boolean>> => {
  const path = join(context.project, HOST_SPECS_FILE);
  const raw = await nodeProjectFiles.read(path)();
  return raw.ok ? ok(hostSpecMatches(raw.value, host)) : raw;
};

/**
 * Deterministic, zero-CLI skill discovery directly from the host's project-local skills directory (`.agents/skills` or
 * `.claude/skills`). Verifies symlink containment and Agent Skills YAML frontmatter without launching any host CLI.
 */
const discoverLocalSkills = async (context: HostContext, skillsDir: string): Promise<Result<readonly DiscoveredSkill[]>> => {
  const root = join(context.project, skillsDir);
  if (!await safePath(context.project, root)) {
    return fail("symlink-escape", `The host skills directory (${skillsDir}) escapes the project or follows a symbolic link.`,
      "Preserve the linked path and choose an unlinked location inside the project.");
  }
  const names = skillNames(root);
  const checked = await Promise.all(names.map(async (name) => {
    const skillDir = join(root, name);
    const skillFile = join(skillDir, "SKILL.md");
    const contained = await safePath(context.project, skillDir) && await safePath(context.project, skillFile);
    if (!contained) return { kind: "escape" as const, name, path: skillFile };
    const read = await readText(skillFile);
    if (!read.ok || read.value === null) return { kind: "invalid" as const, name, path: skillFile };
    return hasValidSkillFrontmatter(read.value, name)
      ? { kind: "valid" as const, skill: { name, path: skillFile, scope: "repo" } satisfies DiscoveredSkill }
      : { kind: "invalid" as const, name, path: skillFile };
  }));
  const escaped = checked.find((entry) => entry.kind === "escape");
  if (escaped !== undefined) {
    return fail("symlink-escape", `Skill ${escaped.name} escapes the project or follows a symbolic link.`,
      "Preserve the linked path and reconcile the active skill directory.");
  }
  return ok(checked.flatMap((entry) => entry.kind === "valid" ? [entry.skill] : []));
};

const CODEX_CONFIG_FILE = ".codex/config.toml" as const;

const TOML_PLAN = String.raw`
import itertools, json, sys, tomllib
raw = json.load(sys.stdin)
text = raw if raw is not None else ''
try:
    old = tomllib.loads(text)
    features = old.get('features', {})
    if not isinstance(features, dict):
        raise ValueError('features is not a table')
    key = 'default_mode_request_user_input'
    if key in features:
        print(json.dumps({'kind': 'existing', 'content': text}))
        sys.exit(0)
    newline = '\r\n' if '\r\n' in text else '\n'
    rows = text.splitlines(keepends=True)
    candidates = itertools.chain(
        ('features.' + key + ' = true' + newline + text,),
        (''.join(rows[:i]) + key + ' = true' + newline + ''.join(rows[i:]) for i in range(len(rows) + 1) if i == 0 or rows[i-1].endswith('\n')),
        (text + ('' if not text or text.endswith('\n') else newline) + key + ' = true' + newline,),
        (text + ('' if not text or text.endswith('\n') else newline) + '[features]' + newline + key + ' = true' + newline,),
    )
    def stable(value):
        if isinstance(value, dict):
            return ('dict', tuple((name, stable(value[name])) for name in sorted(value)))
        if isinstance(value, list):
            return ('list', tuple(stable(item) for item in value))
        return (type(value).__name__, repr(value))
    def valid(candidate):
        try:
            parsed = tomllib.loads(candidate)
            if not isinstance(parsed.get('features'), dict) or parsed['features'].get(key) is not True:
                return False
            normalized = {name: ({field: value for field, value in entry.items() if field != key} if name == 'features' else entry)
                          for name, entry in parsed.items() if not (name == 'features' and name not in old and len(entry) == 1)}
            return stable(normalized) == stable(old)
        except (ValueError, TypeError):
            return False
    chosen = next((candidate for candidate in candidates if valid(candidate)), None)
    print(json.dumps({'kind': 'change', 'content': chosen} if chosen is not None else {'kind': 'invalid'}))
except (ValueError, TypeError):
    print(json.dumps({'kind': 'invalid'}))
`;

type ConfigPlan = { readonly kind: "existing" | "change"; readonly content: string };
const configFailure = (): Result<never> => fail("invalid-codex-config", "The Codex configuration cannot be safely updated.", "Preserve the file and resolve its TOML or path before rerunning setup.");
const planConfig = (python: string, project: string, existing: string | null): Promise<Result<ConfigPlan>> => new Promise((resolve) => {
  const child = execFile(python, ["-I", "-c", TOML_PLAN], { cwd: project, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
    try {
      const value: unknown = error === null ? JSON.parse(stdout) : null;
      resolve(typeof value === "object" && value !== null && "kind" in value && "content" in value
        && (value.kind === "existing" || value.kind === "change") && typeof value.content === "string"
        ? ok({ kind: value.kind, content: value.content }) : configFailure());
    } catch { resolve(configFailure()); }
  });
  child.stdin?.on("error", () => resolve(configFailure()));
  child.stdin?.end(JSON.stringify(existing));
});
const configPlan = async (context: HostContext): Promise<Result<{ readonly previous: string | null; readonly plan: ConfigPlan }>> => {
  const path = join(context.project, CODEX_CONFIG_FILE);
  if (!await safePath(context.project, path)) return configFailure();
  const existing = await readConfinedText(context.project, path, context.python);
  if (!existing.ok) return configFailure();
  const planned = await planConfig(context.python, context.project, existing.value);
  return planned.ok ? ok({ previous: existing.value, plan: planned.value }) : planned;
};

const ensureCodexConfig = async (context: HostContext): Promise<Result<string>> => {
  const path = join(context.project, CODEX_CONFIG_FILE);
  const result = await configPlan(context);
  if (!result.ok) return result;
  if (result.value.plan.kind === "existing") return ok(path);
  const dir = await directory(context.project, dirname(path));
  if (!dir.ok) return dir;
  return writeText(context.project, path, result.value.plan.content, result.value.previous, context.python, true);
};

const CODEX = Object.freeze<HostTooling>({
  label: "Codex",
  changes: "Codex project skills (.agents/skills), config (.codex/config.toml), hooks (.codex/hooks.json), and host spec receipt (.agent-plugins/host-specs.json)",
  frameworkDir: "plugins",
  manifest: ".codex-plugin/plugin.json",
  bareSkills: HOST_SPECS.codex.skillsDir,
  spec: HOST_SPECS.codex,
  catalog: (_context, _plugins) => Promise.resolve(ok(HOST_SPECS_FILE)),
  register: (context) => registerSpec(context, "codex").then((saved) => saved.ok && context.codexQuestions === true ? ensureCodexConfig(context).then((cfg) => cfg.ok ? saved : cfg) : saved),
  registered: async (context) => {
    const spec = await specRegistered(context, "codex");
    if (!spec.ok || !spec.value || context.codexQuestions !== true) return spec;
    const cfg = await configPlan(context);
    return cfg.ok ? ok(cfg.value.plan.kind === "existing") : cfg;
  },
  activate: (_context, plugin) => Promise.resolve(ok(plugin.name)),
  discover: (context) => discoverLocalSkills(context, HOST_SPECS.codex.skillsDir),
});

const CLAUDE = Object.freeze<HostTooling>({
  label: "Claude Code",
  changes: "Claude Code project skills (.claude/skills), hooks (.claude/settings.local.json), and host spec receipt (.agent-plugins/host-specs.json)",
  frameworkDir: "hosts/claude",
  manifest: ".claude-plugin/plugin.json",
  bareSkills: HOST_SPECS.claude.skillsDir,
  spec: HOST_SPECS.claude,
  catalog: (_context, _plugins) => Promise.resolve(ok(HOST_SPECS_FILE)),
  register: (context) => registerSpec(context, "claude"),
  registered: (context) => specRegistered(context, "claude"),
  activate: (_context, plugin) => Promise.resolve(ok(plugin.name)),
  discover: (context) => discoverLocalSkills(context, HOST_SPECS.claude.skillsDir),
});

/** Claude Code keeps its user state in `.claude.json` inside `CLAUDE_CONFIG_DIR` when set, otherwise in the home folder. */
export const claudeStateFile = (home: string, configDir: string | undefined): string => join(configDir ?? home, ".claude.json");

export const HOSTS: Readonly<Record<HostName, HostTooling>> = Object.freeze({ codex: CODEX, claude: CLAUDE });

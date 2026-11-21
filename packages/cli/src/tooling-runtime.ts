import { chmod, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256 } from "@agent-plugins/compiler";
import { nodeProjectFiles, object, ok, fail, type Result } from "@agent-plugins/project";
import type { BootstrapInput } from "./tooling-input.js";
import { command, scaled, sequence } from "./tooling-process.js";
import { backupOwnedText, directory, readText, safePath, setupFailure, writeText } from "./tooling-files.js";
import { FRAMEWORK_PLUGINS, frameworkPluginRoot, pluginTarget, toolsRoot } from "./tooling-host.js";
import type { HostName } from "./host-names.js";
import { HOSTS } from "./host-table.js";
import { resolveSourceBundle } from "./bundle-source.js";
import { readOwnership, recordOwnership, type OwnershipLedger } from "./tooling-ownership.js";

/** Path to the staged standalone knowledge store's zero-MCP stdlib Python query/curate CLI. */
export const knowledgeQueryScript = (project: string): string =>
  join(pluginTarget(project, "monolithic-agent-knowledge-store"), "source", "scripts", "query.py");

export const installSkills = (project: string, host: HostName): Promise<Result<string>> =>
  sequence(FRAMEWORK_PLUGINS, (name) => installPlugin(project, host, name), "Framework skills materialized.");

/** Validate every materialized framework skill in `<hostSkillsDir>` against the compiled bundle's SHA-256 digests. */
export const installedSkills = async (project: string, host: HostName): Promise<boolean> => {
  const checked = await Promise.all(FRAMEWORK_PLUGINS.map((name) => installedPlugin(project, host, name)));
  return checked.every(Boolean);
};

const skillEntriesFromBundle = (project: string, host: HostName, name: string): Result<{ readonly digest: string; readonly skills: readonly { readonly skill: string; readonly content: Buffer; readonly sha256: string }[] }> => {
  const shipped = resolveSourceBundle(frameworkPluginRoot(name), host);
  if (!shipped.ok) return setupFailure(shipped.diagnostics.map((d) => d.message).join(" "));
  const skills = shipped.value.bundle.files
    .filter((file) => /^skills\/[^/]+\/SKILL\.md$/u.test(file.path))
    .map((file) => ({
      skill: file.path.split("/")[1] ?? "",
      content: Buffer.from(file.content),
      sha256: sha256(file.content),
    }));
  return ok({ digest: shipped.value.bundle.manifest.payloadDigest, skills });
};

const installedPlugin = async (project: string, host: HostName, name: string): Promise<boolean> => {
  const bundle = skillEntriesFromBundle(project, host, name);
  if (!bundle.ok || bundle.value.skills.length === 0) return false;
  const base = join(project, HOSTS[host].bareSkills);
  const checks = await Promise.all(bundle.value.skills.map(async ({ skill, sha256: expected }) => {
    const file = join(base, skill, "SKILL.md");
    if (!await safePath(project, file)) return false;
    const read = await readText(file);
    return read.ok && read.value !== null && sha256(Buffer.from(read.value, "utf8")) === expected;
  }));
  return checks.every(Boolean);
};

const installPlugin = async (project: string, host: HostName, name: string): Promise<Result<string>> => {
  const bundle = skillEntriesFromBundle(project, host, name);
  if (!bundle.ok) return bundle;
  const base = join(project, HOSTS[host].bareSkills);
  const createdBase = await directory(project, base);
  if (!createdBase.ok) return createdBase;
  return sequence(bundle.value.skills, async ({ skill, content, sha256: expectedDigest }) => {
    const target = join(base, skill);
    const skillFile = join(target, "SKILL.md");
    const markerFile = join(target, ".upf-source");
    if (!await safePath(project, target)) {
      return fail("symlink-escape", `Framework skill ${skill} follows a linked path.`, "Preserve the link and reconcile the active skill directory.");
    }
    const ownerPrefix = `${name}/${skill}@`;
    const expectedMarker = `${ownerPrefix}${bundle.value.digest}`;
    const [marker, existing] = await Promise.all([readText(markerFile), readText(skillFile)]);
    if (!marker.ok) return marker;
    if (!existing.ok) return existing;
    if (marker.value === expectedMarker && existing.value !== null && sha256(Buffer.from(existing.value, "utf8")) === expectedDigest) {
      return ok(target);
    }
    if (marker.value !== null && !marker.value.startsWith(ownerPrefix)) {
      return fail("modified-file", `Existing skill ${skill} has different ownership.`, "Preserve the existing skill and reconcile ownership explicitly.");
    }
    if (marker.value === null && existing.value !== null) {
      return fail("unmanaged-file", `Existing skill ${skill} is unmanaged; preserve it.`, "Move or reconcile the unmanaged skill before rerunning setup.");
    }
    if (marker.value !== null && marker.value.startsWith(ownerPrefix)) {
      await rm(target, { recursive: true, force: true });
    }
    const created = await directory(project, target);
    if (!created.ok) return created;
    try {
      const entries = await readdir(target);
      if (entries.length > 0) return fail("unmanaged-file", `Existing skill directory ${skill} is not empty.`, "Preserve existing files and reconcile ownership before rerunning.");
      await writeFile(skillFile, content);
      await writeFile(markerFile, expectedMarker, "utf8");
      return ok(target);
    } catch {
      return fail("partial-step", `Framework skill ${skill} could not be materialized.`, "Inspect the partial skill directory and rerun setup.");
    }
  }, name);
};

/** Verify user-provided Python 3.12+ for the standalone knowledge store (zero venv, zero pip, zero MCP). */
export const installKnowledge = async (project: string, input: BootstrapInput, patience = 1): Promise<Result<string>> =>
  command(input.python, ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)"], project, scaled(30_000, patience))
    .then((checked) => checked.ok ? ok(input.python) : fail("python-missing", "Python 3.12+ is required for the standalone knowledge store.",
      "Install Python 3.12 or newer, or pass --python <executable>, then rerun setup."));

const knowledgeSupportFiles = (relRoot: string, language: string): readonly (readonly [string, string])[] => [
  ["manifest.md", `---\nschema_version: 1\nstore_root: ${relRoot}\nlanguage: ${language}\n---\n\n# Project Knowledge Store\n\nFive-tier Markdown knowledge store (\`identity\`, \`structure\`, \`mechanics\`, \`rules\`, \`evolution\`).\n`],
  ["QUERY_GUIDE.md", `# Project Knowledge Query Guide\n\nUse \`.upf-tools/bin/maks\` (or \`python3.12 .upf-tools/plugins/monolithic-agent-knowledge-store/source/scripts/query.py\`) to inspect current project facts before broad file reads.\n\n- Launcher: \`.upf-tools/bin/maks\`\n- Store root: \`${relRoot}\`\n- Locator: \`project-knowledge.json\`\n- Commands: \`catalog\`, \`find\`, \`fetch\` (\`--history\`), \`glossary\`, \`links\`, \`rebuild-catalog\`, \`curate\`, \`validate-lineage\`\n`],
  ["glossary.md", "# Project Glossary\n\nSourced project terms and aliases. Every entry cites its authoritative source.\n\n| Term | Aliases | Definition | Source |\n| --- | --- | --- | --- |\n"],
];

const isExistError = (error: unknown): boolean => object(error) && error.code === "EEXIST";

const ensureMissingSupportFile = async (project: string, file: string, content: string): Promise<Result<string>> => {
  if (!await safePath(project, file)) {
    return fail("symlink-escape", "The knowledge support file escapes the project or follows a symbolic link.",
      "Preserve the linked path and choose an unlinked location inside the project.");
  }
  return writeFile(file, content, { encoding: "utf8", flag: "wx" })
    .then(() => ok(file))
    .catch((error: unknown) => isExistError(error) ? ok(file) : setupFailure("Could not scaffold a project knowledge support file."));
};

/** Writes canonical `project-knowledge.json` for new installs; updates legacy `.project-knowledge.json` if it is the sole locator; fails on conflicts. */
export const configureKnowledge = async (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const visiblePath = join(project, "project-knowledge.json");
  const legacyPath = join(project, ".project-knowledge.json");
  const [visible, legacy] = await Promise.all([nodeProjectFiles.read(visiblePath)(), nodeProjectFiles.read(legacyPath)()]);
  if (!visible.ok) return visible;
  if (!legacy.ok) return legacy;
  const visibleObj = object(visible.value) ? (visible.value as Readonly<Record<string, unknown>>) : null;
  const legacyObj = object(legacy.value) ? (legacy.value as Readonly<Record<string, unknown>>) : null;
  if (visibleObj !== null && legacyObj !== null && visibleObj.knowledgeRoot !== legacyObj.knowledgeRoot) {
    return setupFailure("Conflicting knowledge locators found in project-knowledge.json and .project-knowledge.json; reconcile them explicitly.");
  }
  const targetPath = visibleObj === null && legacyObj !== null ? legacyPath : visiblePath;
  const existingValue = visibleObj === null && legacyObj !== null ? legacy.value : visible.value;
  const selected = visibleObj ?? legacyObj ?? {};
  const answersObj = object(input.answers) ? input.answers : null;
  const answerLanguage = answersObj !== null && typeof answersObj.language === "string" && answersObj.language.length > 0 ? answersObj.language : "en";
  const language = typeof selected.language === "string" && selected.language.length > 0 ? selected.language : answerLanguage;
  const tracked = typeof selected.tracked === "boolean" ? selected.tracked : true;
  const conflicts = Object.entries(input.knowledge).some(([key, value]) => selected[key] !== undefined && selected[key] !== value);
  const storeDir = join(project, input.knowledge.knowledgeRoot);
  const folders = [...new Set([input.knowledge.knowledgeRoot, input.knowledge.docsRoot, input.knowledge.vaultRoot])];
  return conflicts
    ? setupFailure("Saved project knowledge choices differ from the accepted plan; reconcile them explicitly.")
    : sequence(folders, (rel) => directory(project, join(project, rel)), storeDir).then((created) =>
        created.ok
          ? nodeProjectFiles.write(targetPath, { ...selected, schemaVersion: 1, language, tracked, ...input.knowledge }, existingValue)()
              .then((saved) => saved.ok
                ? sequence(knowledgeSupportFiles(input.knowledge.knowledgeRoot, language),
                    ([name, content]) => ensureMissingSupportFile(project, join(storeDir, name), content), targetPath)
                : saved)
          : created,
      );
};

const MAKS_MARKER = ".upf-tools/bin/maks";
const maksPath = (project: string): string => join(toolsRoot(project), "bin/maks");
const maksContent = (project: string, python: string): string =>
  `#!/usr/bin/env node\nimport { spawnSync } from "node:child_process";\nconst r = spawnSync(${JSON.stringify(python)}, [${JSON.stringify(knowledgeQueryScript(project))}, ...process.argv.slice(2)], { stdio: "inherit" });\nprocess.exitCode = r.status ?? 1;\n`; // fp-allow: no-field-write, no-ambient-effect -- generated external CLI launcher boundary

/** Whether the staged MAKS query.py script is present in this project. */
export const hasStagedMaks = (project: string): Promise<boolean> =>
  readText(knowledgeQueryScript(project)).then((read) => read.ok && read.value !== null);

/** Whether the executable `.upf-tools/bin/maks` launcher matches the project's Python and staged query.py. */
export const installedMaks = async (project: string, python: string): Promise<boolean> => {
  const current = await readText(maksPath(project));
  return current.ok && current.value === maksContent(project, python);
};

/** Create or refresh the cross-platform `.upf-tools/bin/maks` launcher for the standalone knowledge store. */
export const wireMaks = async (project: string, python: string): Promise<Result<string>> => {
  const target = maksPath(project);
  if (!await safePath(project, target)) {
    return fail("symlink-escape", "The maks launcher path escapes the project or follows a symbolic link.",
      "Preserve the linked path and choose an unlinked location inside the project.");
  }
  const dir = await directory(project, dirname(target));
  if (!dir.ok) return dir;
  return writeFile(target, maksContent(project, python), { encoding: "utf8" })
    .then(() => process.platform === "win32" ? ok(target) : chmod(target, 0o755).then(() => ok(target)))
    .catch(() => setupFailure("Could not write the .upf-tools/bin/maks knowledge launcher."));
};

const hasMaksMarker = (command: unknown): boolean =>
  typeof command === "string" && command.replace(/[\\/]+/g, "/").includes(MAKS_MARKER);

const isMaksHookEntry = (entry: unknown): boolean => {
  if (!object(entry)) return false;
  if (hasMaksMarker(entry.command)) return true;
  return Array.isArray(entry.hooks) && entry.hooks.some((hook: unknown) => object(hook) && hasMaksMarker(hook.command));
};

const maksHookSpecs = (maksCmd: string, includeStop: boolean): Readonly<Record<string, Readonly<Record<string, unknown>>>> => ({
  SessionStart: { matcher: "", hooks: [{ type: "command", command: `${JSON.stringify(maksCmd)} orient` }] },
  UserPromptSubmit: { matcher: "", hooks: [{ type: "command", command: `${JSON.stringify(maksCmd)} inject` }] },
  PreToolUse: { matcher: "Read|Edit|Write|MultiEdit|apply_patch|Bash|Grep|Glob", hooks: [{ type: "command", command: `${JSON.stringify(maksCmd)} gate` }] },
  ...(includeStop ? { Stop: { matcher: "", hooks: [{ type: "command", command: `${JSON.stringify(maksCmd)} session-end` }] } } : {}),
});

/** Purely merge MAKS lifecycle hooks into host hooks/settings JSON while preserving unrelated hooks and settings. */
export const mergeMaksHooks = (existing: unknown, maksCmd: string, includeStop: boolean): Readonly<Record<string, unknown>> => {
  const base = object(existing) ? existing : {};
  const existingHooks = object(base.hooks) ? base.hooks : {};
  const specs = maksHookSpecs(maksCmd, includeStop);
  const mergedEvents = Object.fromEntries(Object.entries(specs).map(([event, spec]) => {
    const current = Array.isArray(existingHooks[event]) ? existingHooks[event].filter((entry: unknown) => !isMaksHookEntry(entry)) : [];
    return [event, [...current, spec]];
  }));
  return { ...base, hooks: { ...existingHooks, ...mergedEvents } };
};

/** Pure check that every expected MAKS lifecycle hook event is wired. */
export const hasMaksHooks = (existing: unknown, includeStop: boolean): boolean => {
  if (!object(existing) || !object(existing.hooks)) return false;
  const hooks = existing.hooks;
  const events = includeStop ? ["SessionStart", "UserPromptSubmit", "PreToolUse", "Stop"] : ["SessionStart", "UserPromptSubmit", "PreToolUse"];
  return events.every((event) => Array.isArray(hooks[event]) && hooks[event].some(isMaksHookEntry));
};

const maksHooksTarget = (project: string, host: HostName): { readonly path: string; readonly includeStop: boolean } =>
  host === "claude"
    ? { path: join(project, ".claude/settings.local.json"), includeStop: true }
    : { path: join(project, ".codex/hooks.json"), includeStop: true };

/** Whether the selected host's config file has MAKS hooks wired. */
export const installedMaksHooks = async (project: string, host: HostName): Promise<boolean> => {
  const { path, includeStop } = maksHooksTarget(project, host);
  const raw = await nodeProjectFiles.read(path)();
  return raw.ok && hasMaksHooks(raw.value, includeStop);
};

/** Wire MAKS lifecycle hooks into `.codex/hooks.json` (Codex) or `.claude/settings.local.json` (Claude Code). */
export const wireMaksHooks = async (project: string, host: HostName): Promise<Result<string>> => {
  const { path, includeStop } = maksHooksTarget(project, host);
  if (!await safePath(project, path)) {
    return fail("symlink-escape", "The host hooks file escapes the project or follows a symbolic link.",
      "Preserve the linked path and choose an unlinked location inside the project.");
  }
  const dir = await directory(project, dirname(path));
  if (!dir.ok) return dir;
  const raw = await nodeProjectFiles.read(path)();
  if (!raw.ok) return raw;
  const next = mergeMaksHooks(raw.value, maksPath(project), includeStop);
  return nodeProjectFiles.write(path, next, raw.value)().then((saved) => saved.ok ? ok(path) : saved);
};

export const configureReview = async (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const path = join(project, ".monolithic-code-review/sources.json");
  const safe = await safePath(project, path);
  return safe ? configureReviewFile(project, input, path) : setupFailure("Review configuration follows a link outside the accepted project path; preserve it and reconcile its location.");
};
export const reviewBindingsValid = (value: unknown): value is Readonly<Record<string, unknown>> => object(value)
  && object(value.scm) && typeof value.scm.provider === "string" && object(value.scm.capabilities)
  && ["get_pull_request", "get_pull_request_diff"].every((key) => object(value.scm) && object(value.scm.capabilities) && usableBinding(value.scm.capabilities[key]))
  && object(value.tracker) && object(value.tracker.capabilities)
  && ["fetch_work_item", "fetch_parent", "list_linked_artifacts"].every((key) => object(value.tracker) && object(value.tracker.capabilities) && usableBinding(value.tracker.capabilities[key]));
const bindingText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const usableBinding = (value: unknown): boolean => {
  switch (typeof value) {
    case "string": return bindingText(value);
    default: return object(value) && structuredBinding(value);
  }
};
const structuredBinding = (value: Readonly<Record<string, unknown>>): boolean => {
  switch (value.kind ?? value.type) {
    case "mcp_tool": return bindingText(value.server) && bindingText(value.tool);
    case "command": return bindingText(value.program) && Array.isArray(value.args) && value.args.every((arg: unknown) => typeof arg === "string");
    case "path": return bindingText(value.path);
    default: return false;
  }
};
const configureReviewFile = async (project: string, input: BootstrapInput, path: string): Promise<Result<string>> => {
  const raw = await nodeProjectFiles.read(path)();
  const settings = raw.ok && reviewBindingsValid(raw.value) ? raw.value : undefined;
  const knowledge = settings !== undefined && object(settings.knowledge) ? settings.knowledge : {};
  return !raw.ok ? raw : settings === undefined ? fail("review-setup-needed", "Review provider bindings have not been configured.",
    "Run the installed review-setup skill with the project's selected tracker, SCM and shared knowledge root; then resume bootstrap.")
    : typeof knowledge.root === "string" && knowledge.root !== input.knowledge.knowledgeRoot ? setupFailure("Review and project knowledge settings disagree; choose one shared store before resuming.")
      : nodeProjectFiles.write(path, { ...settings, knowledge: { ...knowledge, root: input.knowledge.knowledgeRoot,
        committed: knowledge.committed ?? false } }, raw.value)().then((written) => written.ok ? ok(path) : written);
};

const cliContent = (entry: URL): string => `#!/usr/bin/env node\nimport(${JSON.stringify(entry.href)}).then(m => Promise.resolve(m.run(process.argv.slice(2))).then(code => { process.exitCode = code; }));\n`; // fp-allow: no-field-write, no-ambient-effect -- generated external CLI boundary sets its process exit status
const cliPath = (project: string): string => join(toolsRoot(project), "bin/agent-plugin");
/** The launcher must point at this release, rather than merely run an older CLI successfully. */
export const installedCli = async (project: string, entry = new URL("./index.js", import.meta.url)): Promise<boolean> => {
  const current = await readText(cliPath(project));
  return current.ok && current.value === cliContent(entry);
};
const CLI_ENTRY = ".upf-tools/bin/agent-plugin";
/** A digest receipt permits replacing only a previously owned, unmodified CLI launcher. */
export const wireCli = async (project: string, entry = new URL("./index.js", import.meta.url), python = "python3"): Promise<Result<string>> => {
  const path = cliPath(project);
  const [old, legacy, ledger] = await Promise.all([readText(path), readText(`${path}.sha256`), readOwnership(project)]);
  const content = cliContent(entry);
  return !old.ok ? old : !legacy.ok ? legacy : !ledger.ok ? ledger
    : replaceOwnedCli(project, path, content, old.value, legacy.value, ledger.value, python);
};

const replaceOwnedCli = (project: string, path: string, content: string, old: string | null, legacy: string | null, ledger: OwnershipLedger, python: string): Promise<Result<string>> => {
  const receipt = Object.hasOwn(ledger.entries, CLI_ENTRY) ? ledger.entries[CLI_ENTRY] : legacy;
  return old !== null && old !== content && receipt !== sha256(old)
    ? Promise.resolve(fail(receipt === null ? "unmanaged-file" : "modified-file", "The existing project CLI cannot be replaced automatically.", "Preserve the launcher and reconcile its ownership before upgrading."))
    : old === null && receipt !== null ? Promise.resolve(fail("partial-step", "A CLI receipt exists without its launcher.", "Reconcile the interrupted installation before rerunning."))
    : replaceCli(project, path, content, old, ledger, python);
};

const replaceCli = async (project: string, path: string, content: string, old: string | null, ledger: OwnershipLedger, python: string): Promise<Result<string>> => {
  const backup = old !== null && old !== content ? await backupOwnedText(project, path, old, python) : ok(null);
  return !backup.ok ? backup : writeText(project, path, content, old, python).then((written) => written.ok
    ? recordOwnership(project, ledger, CLI_ENTRY, sha256(content), python).then((saved) => saved.ok ? ok(path) : saved) : written);
};

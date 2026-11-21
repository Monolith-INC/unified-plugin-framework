import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@agent-plugins/compiler";
import { installVendorBundle } from "@agent-plugins/installer";
import { nodeProjectFiles, object, ok, fail, type Result } from "@agent-plugins/project";
import type { BootstrapInput } from "./tooling-input.js";
import { command, scaled, sequence } from "./tooling-process.js";
import { backupOwnedText, directory, readText, safePath, setupFailure, writeText } from "./tooling-files.js";
import { FRAMEWORK_PLUGINS, frameworkPluginRoot, frameworkTarget, pluginTarget, toolsRoot } from "./tooling-host.js";
import type { HostName } from "./host-names.js";
import { resolveSourceBundle } from "./bundle-source.js";
import { readOwnership, recordOwnership, type OwnershipLedger } from "./tooling-ownership.js";

/** Path to the staged standalone knowledge store's zero-MCP stdlib Python query/curate CLI. */
export const knowledgeQueryScript = (project: string): string =>
  join(pluginTarget(project, "monolithic-agent-knowledge-store"), "source", "scripts", "query.py");

export const installSkills = (project: string, host: HostName): Promise<Result<string>> =>
  sequence(FRAMEWORK_PLUGINS, (name) => installPlugin(project, host, name), "Framework payloads installed.");

/** Validate observed installed bytes against the bundle built from the framework source, as the installer builds it. */
export const installedSkills = async (project: string, host: HostName): Promise<boolean> => {
  const checked = await Promise.all(FRAMEWORK_PLUGINS.map((name) => installedPlugin(project, host, name)));
  return checked.every(Boolean);
};
const installedPlugin = async (project: string, host: HostName, name: string): Promise<boolean> => {
  const shipped = resolveSourceBundle(frameworkPluginRoot(name), host);
  return !shipped.ok ? false : Promise.all(shipped.value.bundle.manifest.files.map(async (file) => {
    const read = await readFile(join(frameworkTarget(project, host, name), file.path)).catch(() => null);
    return read !== null && sha256(read) === file.sha256;
  })).then((files) => files.every(Boolean));
};
const installPlugin = (project: string, host: HostName, name: string): Promise<Result<string>> => directory(project, frameworkTarget(project, host, name)).then((created) => {
  const distribution = resolveSourceBundle(frameworkPluginRoot(name), host);
  const installed = created.ok && distribution.ok ? installVendorBundle({ ...distribution.value, target: { root: created.value } }) : undefined;
  return !created.ok ? created : !distribution.ok ? setupFailure(distribution.diagnostics.map((d) => d.message).join(" "))
    : installed?.kind === "installed" || installed?.kind === "unchanged" ? ok(name) : setupFailure(`Could not install ${name}; preserve the installer diagnostics and resolve its target conflict.`);
});

/** Verify user-provided Python 3.12+ for the standalone knowledge store (zero venv, zero pip, zero MCP). */
export const installKnowledge = async (project: string, input: BootstrapInput, patience = 1): Promise<Result<string>> =>
  command(input.python, ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)"], project, scaled(30_000, patience))
    .then((checked) => checked.ok ? ok(input.python) : fail("python-missing", "Python 3.12+ is required for the standalone knowledge store.",
      "Install Python 3.12 or newer, or pass --python <executable>, then rerun setup."));

const knowledgeSupportFiles = (relRoot: string, language: string): readonly (readonly [string, string])[] => [
  ["manifest.md", `---\nschema_version: 1\nstore_root: ${relRoot}\nlanguage: ${language}\n---\n\n# Project Knowledge Store\n\nFive-tier Markdown knowledge store (\`identity\`, \`structure\`, \`mechanics\`, \`rules\`, \`evolution\`).\n`],
  ["QUERY_GUIDE.md", `# Project Knowledge Query Guide\n\nUse \`query.py\` with Python 3.12+ (stdlib only) to inspect current project facts before broad file reads.\n\n- Store root: \`${relRoot}\`\n- Locator: \`project-knowledge.json\`\n- Commands: \`catalog\`, \`find\`, \`fetch\` (\`--history\`), \`glossary\`, \`links\`, \`rebuild-catalog\`, \`curate\`, \`validate-lineage\`\n`],
  ["glossary.md", "# Project Glossary\n\nSourced project terms and aliases. Every entry cites its authoritative source.\n\n| Term | Aliases | Definition | Source |\n| --- | --- | --- | --- |\n"],
];

const ensureMissingSupportFile = (project: string, file: string, content: string, python: string): Promise<Result<string>> =>
  readText(file).then((existing) => !existing.ok ? existing : existing.value !== null ? ok(file) : writeText(project, file, content, null, python));

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
  return conflicts
    ? setupFailure("Saved project knowledge choices differ from the accepted plan; reconcile them explicitly.")
    : directory(project, storeDir).then((created) =>
        created.ok
          ? nodeProjectFiles.write(targetPath, { ...selected, schemaVersion: 1, language, tracked, ...input.knowledge }, existingValue)()
              .then((saved) => saved.ok
                ? sequence(knowledgeSupportFiles(input.knowledge.knowledgeRoot, language),
                    ([name, content]) => ensureMissingSupportFile(project, join(storeDir, name), content, input.python), targetPath)
                : saved)
          : created,
      );
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

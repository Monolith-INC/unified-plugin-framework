import { cp, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@agent-plugins/compiler";
import { installVendorBundle } from "@agent-plugins/installer";
import { nodeProjectFiles, object, ok, fail, type Result } from "@agent-plugins/project";
import type { BootstrapInput } from "./tooling-input.js";
import { command, sequence } from "./tooling-process.js";
import { backupOwnedText, directory, readText, safePath, setupFailure, withSetupStage, writeText } from "./tooling-files.js";
import { FRAMEWORK_PLUGINS, FRAMEWORK_ROOT, frameworkTarget, toolsRoot } from "./tooling-host.js";
import type { HostName } from "./host-names.js";
import { resolveSourceBundle } from "./bundle-source.js";
import { readOwnership, recordOwnership, type OwnershipLedger } from "./tooling-ownership.js";

export const pythonRuntime = (project: string): string => join(project, ".project-knowledge/runtime", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
export const knowledgeExecutable = (project: string): string => join(project, ".project-knowledge/runtime/bin/upf-project-knowledge");

export const installSkills = (project: string, host: HostName): Promise<Result<string>> =>
  sequence(FRAMEWORK_PLUGINS, (name) => installPlugin(project, host, name), "Framework payloads installed.");

/** Validate observed installed bytes against the bundle built from the framework source, as the installer builds it. */
export const installedSkills = async (project: string, host: HostName): Promise<boolean> => {
  const checked = await Promise.all(FRAMEWORK_PLUGINS.map((name) => installedPlugin(project, host, name)));
  return checked.every(Boolean);
};
const installedPlugin = async (project: string, host: HostName, name: string): Promise<boolean> => {
  const shipped = resolveSourceBundle(join(FRAMEWORK_ROOT, "plugins", name), host);
  return !shipped.ok ? false : Promise.all(shipped.value.bundle.manifest.files.map(async (file) => {
    const read = await readFile(join(frameworkTarget(project, host, name), file.path)).catch(() => null);
    return read !== null && sha256(read) === file.sha256;
  })).then((files) => files.every(Boolean));
};
const installPlugin = (project: string, host: HostName, name: string): Promise<Result<string>> => directory(project, frameworkTarget(project, host, name)).then((created) => {
  const distribution = resolveSourceBundle(join(FRAMEWORK_ROOT, "plugins", name), host);
  const installed = created.ok && distribution.ok ? installVendorBundle({ ...distribution.value, target: { root: created.value } }) : undefined;
  return !created.ok ? created : !distribution.ok ? setupFailure(distribution.diagnostics.map((d) => d.message).join(" "))
    : installed?.kind === "installed" || installed?.kind === "unchanged" ? ok(name) : setupFailure(`Could not install ${name}; preserve the installer diagnostics and resolve its target conflict.`);
});

/** Install from a private source copy so package builders cannot modify dependency source. */
export const installKnowledge = async (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const runtime = await prepareKnowledgeRuntime(project, input.python);
  return !runtime.ok ? runtime : command(input.python, ["-m", "venv", runtime.value], project).then((venv) => venv.ok
    ? withSetupStage(project, input.python, (stage) => copyRuntime(join(stage, "source"))
      .then((source) => source.ok ? command(pythonRuntime(project), ["-m", "pip", "install", "--disable-pip-version-check", source.value], project, 180_000) : source))
    : venv);
};

const RUNTIME_ENTRY = ".project-knowledge/runtime";
const directoryIdentity = (path: string): Promise<Result<string | null>> =>
  lstat(path, { bigint: true }).then((stat) => stat.isDirectory() ? ok(`${stat.dev}:${stat.ino}`) : unmanagedRuntime())
    .catch((error: unknown) => object(error) && error.code === "ENOENT" ? ok(null) : setupFailure("Could not inspect the knowledge runtime directory."));
const unmanagedRuntime = (): Result<never> => fail("unmanaged-file", "The knowledge runtime directory is not installer-owned.",
  "Preserve the current directory and reconcile its ownership before setup.");

/** Reuse an interrupted runtime only while its directory still matches the recorded owner. */
export const prepareKnowledgeRuntime = async (project: string, python: string): Promise<Result<string>> => {
  const runtime = join(project, RUNTIME_ENTRY);
  const [found, ledger, safe] = await Promise.all([directoryIdentity(runtime), readOwnership(project), safePath(project, runtime)]);
  return !safe ? unmanagedRuntime() : !found.ok ? found : !ledger.ok ? ledger
    : found.value === null ? createOwnedRuntime(project, runtime, ledger.value, python)
      : ledger.value.entries[RUNTIME_ENTRY] === found.value ? ok(runtime) : reuseLegacyRuntime(project, runtime, found.value, ledger.value, python);
};

const saveRuntimeOwner = (project: string, runtime: string, identity: string, ledger: OwnershipLedger, python: string): Promise<Result<string>> =>
  recordOwnership(project, ledger, RUNTIME_ENTRY, identity, python).then((saved) => saved.ok ? ok(runtime) : saved);

const createOwnedRuntime = (project: string, runtime: string, ledger: OwnershipLedger, python: string): Promise<Result<string>> =>
  directory(project, join(project, ".project-knowledge")).then((parent) => !parent.ok ? parent
    : mkdir(runtime, { mode: 0o700 }).then(() => directoryIdentity(runtime))
      .then((created) => !created.ok ? created : created.value === null ? unmanagedRuntime()
        : saveRuntimeOwner(project, runtime, created.value, ledger, python)).catch(unmanagedRuntime));

const reuseLegacyRuntime = async (project: string, runtime: string, identity: string, ledger: OwnershipLedger, python: string): Promise<Result<string>> => {
  const legacy = ledger.entries[RUNTIME_ENTRY] === undefined && await legacyRuntimeInstalled(project, runtime);
  return legacy ? saveRuntimeOwner(project, runtime, identity, ledger, python) : unmanagedRuntime();
};

const legacyRuntimeInstalled = async (project: string, runtime: string): Promise<boolean> => {
  const lib = join(runtime, "lib");
  const safe = await safePath(project, lib);
  const versions = safe ? await readdir(lib).catch(() => []) : [];
  const candidates = versions.filter((name) => /^python3\.\d+$/.test(name)).flatMap((name) =>
    ["0.1.1", "0.1.2"].map((version) => join(lib, name, "site-packages", `upf_project_knowledge-${version}.dist-info`, "METADATA")));
  return (await Promise.all(candidates.map((path) => safePath(project, path).then((inside) =>
    inside ? readText(path).then((read) => read.ok && /^Name: upf-project-knowledge\s*$/m.test(read.value ?? "")) : false)))).some(Boolean);
};
const copyRuntime = (source: string): Promise<Result<string>> =>
  cp(join(FRAMEWORK_ROOT, "runtimes/project-knowledge"), source, { recursive: true, dereference: false,
    filter: (path) => !["build", "dist", "__pycache__"].some((part) => path.split(/[\\/]/).includes(part)) })
    .then(() => ok(source)).catch(() => fail("partial-step", "Knowledge runtime source could not be staged.",
      "Rerun setup to use a fresh installer staging directory."));

export const configureKnowledge = async (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const path = join(project, ".project-knowledge.json");
  const existing = await nodeProjectFiles.read(path)();
  const selected = object(existing.ok ? existing.value : null) ? existing.ok ? existing.value as Readonly<Record<string, unknown>> : {} : {};
  const conflicts = Object.entries(input.knowledge).some(([key, value]) => selected[key] !== undefined && selected[key] !== value);
  return !existing.ok ? existing : conflicts ? setupFailure("Saved project knowledge choices differ from the accepted plan; reconcile them explicitly.")
    : directory(project, join(project, input.knowledge.knowledgeRoot)).then((created) => created.ok
      ? nodeProjectFiles.write(path, { ...selected, schemaVersion: 1, ...input.knowledge }, existing.value)().then((saved) => saved.ok ? ok(path) : saved) : created);
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
        mcp_server: "project-knowledge", committed: knowledge.committed ?? false } }, raw.value)().then((written) => written.ok ? ok(path) : written);
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

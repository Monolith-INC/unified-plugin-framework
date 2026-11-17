import { cp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@agent-plugins/compiler";
import { installVendorBundle } from "@agent-plugins/installer";
import { nodeProjectFiles, object, ok, fail, type Result } from "@agent-plugins/project";
import type { BootstrapInput } from "./tooling-input.js";
import { command } from "./tooling-process.js";
import { directory, readText, safePath, setupFailure, writeText } from "./tooling-files.js";
import { FRAMEWORK_ROOT, pluginTarget, toolsRoot } from "./tooling-host.js";
import { resolveSourceBundle } from "./index.js";

export const pythonRuntime = (project: string): string => join(project, ".project-knowledge/runtime", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
export const knowledgeExecutable = (project: string): string => join(project, ".project-knowledge/runtime/bin/upf-project-knowledge");

export const installSkills = (project: string): Promise<Result<string>> => installPlugin(project, "unified-plugin-framework")
  .then((installed) => installed.ok ? installPlugin(project, "project-knowledge") : installed);

/** Validate observed installed bytes against the bundle built from the framework source, as the installer builds it. */
export const installedSkills = async (project: string): Promise<boolean> => {
  const checked = await Promise.all(["unified-plugin-framework", "project-knowledge"].map((name) => installedPlugin(project, name)));
  return checked.every(Boolean);
};
const installedPlugin = async (project: string, name: string): Promise<boolean> => {
  const shipped = resolveSourceBundle(join(FRAMEWORK_ROOT, "plugins", name), "codex");
  return !shipped.ok ? false : Promise.all(shipped.value.bundle.manifest.files.map(async (file) => {
    const read = await readFile(join(pluginTarget(project, name), file.path)).catch(() => null);
    return read !== null && sha256(read) === file.sha256;
  })).then((files) => files.every(Boolean));
};
const installPlugin = (project: string, name: string): Promise<Result<string>> => directory(project, pluginTarget(project, name)).then((created) => {
  const distribution = resolveSourceBundle(join(FRAMEWORK_ROOT, "plugins", name), "codex");
  const installed = created.ok && distribution.ok ? installVendorBundle({ ...distribution.value, target: { root: created.value } }) : undefined;
  return !created.ok ? created : !distribution.ok ? setupFailure(distribution.diagnostics.map((d) => d.message).join(" "))
    : installed?.kind === "installed" || installed?.kind === "unchanged" ? ok(name) : setupFailure(`Could not install ${name}; preserve the installer diagnostics and resolve its target conflict.`);
});

/** Install from a private source copy so package builders cannot modify dependency source. */
export const installKnowledge = async (project: string, input: BootstrapInput): Promise<Result<string>> => {
  const runtime = join(project, ".project-knowledge/runtime");
  const created = await directory(project, runtime);
  return !created.ok ? created : command(input.python, ["-m", "venv", runtime], project).then((venv) => venv.ok ? copyRuntime(project) : venv)
    .then((source) => source.ok ? command(pythonRuntime(project), ["-m", "pip", "install", "--disable-pip-version-check", source.value], project, 180_000) : source);
};
const copyRuntime = (project: string): Promise<Result<string>> => {
  const source = join(toolsRoot(project), "runtime-source");
  return directory(project, source).then((created) => created.ok
    ? cp(join(FRAMEWORK_ROOT, "runtimes/project-knowledge"), source, { recursive: true, dereference: false,
      filter: (path) => !["build", "dist", "__pycache__"].some((part) => path.split(/[\\/]/).includes(part)) }).then(() => ok(source))
      .catch(() => setupFailure("Knowledge runtime source could not be staged.")) : created);
};

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

export const wireCli = async (project: string): Promise<Result<string>> => {
  const path = join(toolsRoot(project), "bin/agent-plugin");
  const old = await readText(path);
  const content = `#!/usr/bin/env node\nimport(${JSON.stringify(new URL("./index.js", import.meta.url).href)}).then(m => Promise.resolve(m.run(process.argv.slice(2))).then(code => { process.exitCode = code; }));\n`; // fp-allow: no-field-write, no-ambient-effect -- generated external CLI edge sets its process exit status
  return !old.ok ? old : old.value !== null && old.value !== content ? setupFailure("Existing project CLI differs; preserve it and select the supported runtime explicitly.")
    : writeText(project, path, content, old.value);
};

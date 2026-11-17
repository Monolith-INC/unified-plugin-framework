import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { configure, fail, nodeProjectFiles, nodeProjectIO, object, ok, operate, parseSettings, probeProjectRead, setup, type Result, type ToolingIO, type ToolingObservation, type ToolingStep } from "@agent-plugins/project";
import { CODEX_TOOLING, codexToolingRegistration } from "@agent-plugins/adapter-codex";
import type { BootstrapInput } from "./tooling-input.js";
import { command } from "./tooling-process.js";
import { readText, readToml, setupFailure } from "./tooling-files.js";
import { activeSkillsMatch, discoverHost, frameworkSkills, frameworkSkillsMatch, expectedDependencySkills, installHostPlugins, marketplaceRoot, pendingSources, pluginBindings, pluginNames, pluginTarget, registerHost, resolvedInput, stageDependencies, stagedBindings, toolsRoot } from "./tooling-host.js";
import { configureKnowledge, configureReview, installKnowledge, installSkills, installedCli, installedSkills, knowledgeExecutable, pythonRuntime, reviewBindingsValid, wireCli } from "./tooling-runtime.js";

const ready = (evidence: string): Result<ToolingObservation> => ok({ status: "ready", evidence });
const missing = (recovery: string): Result<ToolingObservation> => ok({ status: "missing", recovery });
const checked = (result: Result<unknown>, evidence: string, recovery: string): Result<ToolingObservation> => result.ok ? ready(evidence) : missing(recovery);
const inputNeeded = (code: string, message: string, recovery: string): Promise<Result<string>> => Promise.resolve(fail(code, message, recovery));

/**
 * Node edge interpreter; setup has one shared lifecycle and no provider-specific workflow logic. Each step sees the
 * accepted input and, once resolved, the same input with fetched dependency roots added.
 */
export const nodeToolingIO = (project: string, input: BootstrapInput): ToolingIO => ({
  inspect: (step) => () => Promise.resolve().then(() => inspect(project, input, resolvedInput(project, input), step)).catch(() => setupFailure("A tooling capability could not be inspected; configuration is preserved.")),
  configure: (step) => () => Promise.resolve().then(() => configureStep(project, input, resolvedInput(project, input), step)).catch(() => setupFailure("A tooling setup step failed; successful configuration is preserved.")),
});
const inspect = async (project: string, input: BootstrapInput, resolved: BootstrapInput, step: ToolingStep): Promise<Result<ToolingObservation>> => {
  switch (step) {
    case "settings": return inspectSettings(project, input);
    case "cli": return installedCli(project).then((current) => current ? command(process.execPath, [join(toolsRoot(project), "bin/agent-plugin"), "--help"], project) : Promise.resolve(setupFailure("The CLI launcher does not point at this release.")))
      .then((result) => checked(result, "Project CLI runs the shared command entry point.", "Expose the existing framework CLI from the supported installation."));
    case "skills": return inspectSkills(project);
    case "dependencies": return inspectDependencies(project, input, resolved);
    case "knowledge-runtime": return command(pythonRuntime(project), ["-c", "import importlib.metadata as m; assert m.version('upf-project-knowledge') == '0.1.1'"], project)
      .then((result) => checked(result, "Isolated knowledge runtime 0.1.1 is installed.", "Install the owned knowledge runtime into the isolated project environment."));
    case "knowledge-settings": return knowledgeSettings(project, input);
    case "knowledge-content": return inspectKnowledgeContent(project, input);
    case "knowledge-server": return inspectServer(project, input);
    case "review": return inspectReview(project, input);
    case "host-discovery": return inspectDiscovery(project, resolved);
    case "tracker": return input.trackerRef === undefined ? probeProjectRead(project)().then((result) => result.ok ? ready(result.value) : result)
      : operate(nodeProjectIO(project), { operation: "get_work_item", ref: input.trackerRef })().then((result) => result.ok && result.value.status === "completed"
        ? ready("Selected adapter read an existing project-scoped item.")
        : result.ok ? missing("Complete project settings and retry the scoped read.") : result);
  }
};
const inspectSettings = async (project: string, input: BootstrapInput): Promise<Result<ToolingObservation>> => {
  const raw = await nodeProjectIO(project).readSettings();
  const current = raw.ok ? parseSettings(raw.value) : raw;
  const accepted = raw.ok ? configure(raw.value, input.answers ?? {}) : raw;
  return current.ok && accepted.ok && JSON.stringify(current.value) === JSON.stringify(accepted.value)
    ? ready("Saved settings match the accepted project choices.")
    : missing("Collect missing choices or apply the accepted changes to project settings; unrelated keys are preserved.");
};
const configureStep = (project: string, input: BootstrapInput, resolved: BootstrapInput, step: ToolingStep): Promise<Result<string>> => {
  switch (step) {
    case "settings": return input.answers === undefined ? inputNeeded("answers-required", "Project choices are incomplete.", "Collect missing choices and include accepted answers; do not infer a tracker.")
      : setup(nodeProjectIO(project), input.answers)().then((result) => result.ok ? ok("Settings saved.") : result);
    case "cli": return wireCli(project).then((written) => written.ok ? chmod(written.value, 0o755).then(() => written) : written);
    case "skills": return installSkills(project).then((installed) => installed.ok ? installHostPlugins(project, input, ["unified-plugin-framework", "project-knowledge"]) : installed);
    case "dependencies": return stageDependencies(project, input).then((staged) => staged.ok ? installHostPlugins(project, resolved, pluginNames(input)) : staged);
    case "knowledge-runtime": return process.platform === "win32" ? inputNeeded("unsupported-runtime", "The knowledge runtime currently supports Linux and macOS.", "Use a supported runtime host; preserve this host's existing configuration.") : installKnowledge(project, input);
    case "knowledge-settings": return configureKnowledge(project, input);
    case "knowledge-content": return inputNeeded("knowledge-discovery-needed", "Project knowledge has not been populated.", "Run the installed discover-project-knowledge skill on the accepted root, preserving authored decisions and citing source evidence; then rerun bootstrap.");
    case "knowledge-server": return registerHost(project, input, knowledgeExecutable(project));
    case "review": return configureReview(project, input);
    case "host-discovery": return stagedBindings(project, input).ok
      ? installHostPlugins(project, resolved, ["unified-plugin-framework", "project-knowledge", ...pluginNames(input)])
      : inputNeeded("host-activation-needed", "Pinned dependencies have not been staged successfully.", "Complete the dependency source recovery, then repeat fresh host discovery; configuration alone is not proof.");
    case "tracker": return inputNeeded("tracker-attention", "The selected project adapter needs attention.", "Follow its authentication or connection recovery; retain saved project choices and do not put credentials in chat or files.");
  }
};

const inspectSkills = async (project: string): Promise<Result<ToolingObservation>> => {
  return await installedSkills(project)
    ? ready("Both verified host payloads are installed with ownership records.") : missing("Install the shipped framework and knowledge payloads, then activate them through the host plugin mechanism.");
};
const knowledgeSettings = async (project: string, input: BootstrapInput): Promise<Result<ToolingObservation>> => {
  const raw = await nodeProjectFiles.read(join(project, ".project-knowledge.json"))();
  return !raw.ok ? raw : object(raw.value) && raw.value.schemaVersion === 1
    && Object.entries(input.knowledge).every(([key, value]) => object(raw.value) && raw.value[key] === value)
    ? ready("Accepted knowledge/document settings match the saved project configuration.") : missing("Create or reconcile the accepted shared knowledge/document settings.");
};
const inspectKnowledgeContent = async (project: string, input: BootstrapInput): Promise<Result<ToolingObservation>> => {
  const root = join(project, input.knowledge.knowledgeRoot);
  const [manifest, catalog] = await Promise.all([readText(join(root, "manifest.md")), readText(join(root, "catalog.tsv"))]);
  return manifest.ok && manifest.value !== null && catalog.ok && (catalog.value?.trim().split("\n").length ?? 0) > 1
    ? ready("Knowledge manifest and a nonempty catalog are present; server verification checks retrieval.")
    : missing("Run discover-project-knowledge to derive source-backed indexed units, then rerun bootstrap.");
};
const inspectServer = async (project: string, input: BootstrapInput): Promise<Result<ToolingObservation>> => {
  const raw = await readToml(input.python, join(project, ".codex/config.toml"), project);
  const addition = raw.ok ? codexToolingRegistration(raw.value, { project, marketplace: marketplaceRoot(project), knowledgeCommand: knowledgeExecutable(project) }) : undefined;
  return !raw.ok ? raw : addition?.ok !== true ? missing("Reconcile the project-scoped server with the accepted isolated runtime; preserve unrelated entries.")
    : addition.value !== "" ? missing("Register the knowledge server and local marketplace in the selected host.")
      : command(knowledgeExecutable(project), ["--project", project, "--verify"], project, 60_000)
        .then((result) => checked(result, "Registered runtime passed real catalog, search and fetch protocol calls.", "Populate the accepted store, restore the runtime, then repeat protocol verification."));
};
const inspectReview = async (project: string, input: BootstrapInput): Promise<Result<ToolingObservation>> => {
  const raw = await nodeProjectFiles.read(join(project, ".monolithic-code-review/sources.json"))();
  return raw.ok && reviewBindingsValid(raw.value) && object(raw.value.knowledge)
    && raw.value.knowledge.root === input.knowledge.knowledgeRoot && raw.value.knowledge.mcp_server === CODEX_TOOLING.server
    ? ready("Review settings point to the project's single knowledge root and server.") : missing("Run review-setup for provider bindings if absent, then point review knowledge to the accepted project root.");
};
const inspectDiscovery = (project: string, input: BootstrapInput): Promise<Result<ToolingObservation>> => discoverHost(project).then((result) => {
  const expected = [...new Set([...frameworkSkills(project).map(({ name }) => name), ...requiredSkills(project, input)])];
  const missingNames = result.ok ? expected.filter((name) => !result.value.some((skill) => skill.name === name)) : [];
  return !result.ok ? result : missingNames.length > 0 ? missing(`Activate the pinned skills in this host: ${missingNames.join(", ")}; then repeat fresh discovery.`)
    : !frameworkSkillsMatch(project, result.value) ? missing("Reactivate the framework plugins so the host replaces its copy cached from an earlier install; then repeat fresh discovery.")
    : !activeSkillsMatch(project, input, result.value) ? fail("active-skill-drift", "A discovered dependency skill differs from the pinned staged source.",
      "Preserve any edited skill, reconcile the active copy with its pinned source and repeat discovery; names or ownership markers alone are insufficient.")
      : ready("Fresh host discovery found and verified the selected framework, knowledge and workflow dependency skills.");
});
const requiredSkills = (project: string, input: BootstrapInput): readonly string[] => {
  const bindings = pluginBindings(project, input);
  return !bindings.ok ? [] : [...new Set([
    ...bindings.value.flatMap(({ adapter }) => Object.keys(adapter.fulfil).map((operation) => `unified-plugin-framework:${operation}`)),
    ...expectedDependencySkills(bindings.value),
  ])];
};
const inspectDependencies = async (project: string, input: BootstrapInput, resolved: BootstrapInput): Promise<Result<ToolingObservation>> => {
  const pending = await pendingSources(project, input);
  const bindings = pluginBindings(project, resolved);
  const staged = stagedBindings(project, input);
  const markers = await Promise.all(pluginNames(input).map((name) => readText(join(pluginTarget(project, name), "upf-source.json"))));
  return !pending.ok ? pending : pending.value.length > 0
    ? missing(`Fetch and verify the pinned sources of ${pending.value.map(({ plugin }) => plugin).join(", ")}, then stage and activate them.`)
    : !bindings.ok ? bindings : staged.ok && markers.every((marker) => marker.ok && marker.value !== null)
      ? ready("Selected dependency sources pass the existing binding gate and staged wrappers are present.")
      : missing("Stage the accepted clean pinned dependency sources and activate them through the host plugin installer.");
};

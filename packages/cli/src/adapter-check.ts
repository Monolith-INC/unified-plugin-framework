import { join, resolve } from "node:path";

import {
  adapterPlugins,
  checkAdapterReadiness,
  findWorkflow,
  type PluginKnowledgeStore,
  type Readiness,
  type ReadinessFacts,
  type WorkflowAdapter,
} from "@agent-plugins/workflows";

import {
  configError,
  gatherBinding,
  parseRootArgs,
  tokenize,
  type Gathered,
  type JsonFile,
  type PluginFactsIo,
  type PluginRootArg,
} from "./plugin-facts.js";
import { NODE_PLUGIN_FACTS_IO } from "./plugin-reader.js";
import { FRAMEWORK_ROOT } from "./tooling-host.js";

export const ADAPTER_CHECK_USAGE = `Usage: agent-plugin adapter-check <workflow> [--framework <dir>] [--plugin-root [<plugin>[@<version>]=]<dir>]... [--project <dir>]

Name a plugin that has no manifest, such as a bare skills folder, as <plugin>=<dir>, and give its release as <plugin>@<version>=<dir>.
When --framework is omitted, the installed framework root is used; staged dependencies under <project>/.upf-tools/plugins/<plugin>/source are discovered automatically when not passed via --plugin-root.

Exit codes: 0 ready, 1 not ready (prints the failing step), 2 invalid arguments or configuration.`;

/** The effects adapter-check needs, injected so the command logic is testable without a console or disk. */
export interface AdapterCheckIo extends PluginFactsIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

interface CheckRequest {
  readonly adapter: WorkflowAdapter<string>;
  readonly framework: string;
  readonly project: string;
  readonly pluginRoots: readonly PluginRootArg[];
}

type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ok"; readonly request: CheckRequest };

const OPTIONS = {
  framework: { type: "string" },
  project: { type: "string" },
  "plugin-root": { type: "string", multiple: true },
  help: { type: "boolean", short: "h" },
} as const;

const explicitPluginName = (io: AdapterCheckIo, root: PluginRootArg): string | undefined => {
  if (root.name !== undefined) return root.name;
  const read = io.readPlugin(root.path);
  return read.ok ? read.value.name : undefined;
};

const withStagedPluginRoots = (
  io: AdapterCheckIo,
  project: string,
  adapter: WorkflowAdapter<string>,
  explicit: readonly PluginRootArg[],
): readonly PluginRootArg[] => {
  const provided = new Set(explicit.map((root) => explicitPluginName(io, root)).filter((name): name is string => name !== undefined));
  const discovered = adapterPlugins(adapter).flatMap((plugin) => {
    if (provided.has(plugin)) return [];
    const source = join(project, ".upf-tools", "plugins", plugin, "source");
    return io.readPlugin(source).ok ? [Object.freeze({ name: plugin, version: undefined, path: source })] : [];
  });
  return [...explicit, ...discovered];
};

const toRequest = (
  positionals: readonly string[],
  values: { readonly framework?: string; readonly project?: string; readonly "plugin-root"?: readonly string[] },
  cwd: string,
): Parsed => {
  const [workflow, ...extra] = positionals;
  const adapter = workflow === undefined ? undefined : findWorkflow(workflow);
  const roots = parseRootArgs(cwd, values["plugin-root"] ?? []);
  const project = resolve(cwd, values.project ?? ".");
  return extra.length > 0
    ? { kind: "invalid", message: `Unexpected arguments: ${extra.join(" ")}.` }
    : adapter === undefined
      ? { kind: "invalid", message: `Unknown workflow ${JSON.stringify(workflow ?? "")}.` }
      : !roots.ok
        ? { kind: "invalid", message: roots.message }
        : {
            kind: "ok",
            request: {
              adapter,
              framework: values.framework === undefined ? FRAMEWORK_ROOT : resolve(cwd, values.framework),
              project,
              pluginRoots: roots.roots,
            },
          };
};

/** Parses `adapter-check` arguments; `cwd` resolves relative paths. */
export const parseAdapterCheck = (argv: readonly string[], cwd: string): Parsed => {
  const tokens = tokenize(argv, OPTIONS);
  return typeof tokens === "string"
    ? { kind: "invalid", message: tokens }
    : tokens.values.help === true
      ? { kind: "help" }
      : toRequest(tokens.positionals, tokens.values, cwd);
};

const valueAt = (file: JsonFile, key: readonly string[]): unknown =>
  key.reduce<unknown>(
    (current, part) => (typeof current === "object" && current !== null ? (current as Readonly<Record<string, unknown>>)[part] : undefined),
    file.kind === "value" ? file.value : undefined,
  );

/** The store path a config file records, resolved against the project; `undefined` when unset or not a string. */
const storePath = (project: string, file: JsonFile, key: readonly string[]): string | undefined => {
  const value = valueAt(file, key);
  return typeof value === "string" && value.trim() !== "" ? resolve(project, value) : undefined;
};

const unreadable = (files: readonly JsonFile[]): readonly string[] =>
  files.flatMap((file) => (file.kind === "unreadable" ? [`Could not read valid JSON from ${file.path}.`] : []));

/** The binding facts plus the project's knowledge stores (supporting canonical `project-knowledge.json` and legacy `.project-knowledge.json`). */
const gather = (io: AdapterCheckIo, { adapter, framework, project, pluginRoots }: CheckRequest): Gathered<ReadinessFacts> => {
  const binding = gatherBinding(io, adapter, framework, withStagedPluginRoots(io, project, adapter, pluginRoots));
  const visibleFile = io.readJson(resolve(project, "project-knowledge.json"));
  const legacyFile = io.readJson(resolve(project, ".project-knowledge.json"));
  const visibleStore = storePath(project, visibleFile, ["knowledgeRoot"]);
  const legacyStore = storePath(project, legacyFile, ["knowledgeRoot"]);
  const locatorConflict =
    visibleStore !== undefined && legacyStore !== undefined && visibleStore !== legacyStore
      ? [`Conflicting project knowledge locators: project-knowledge.json points to ${visibleStore} while .project-knowledge.json points to ${legacyStore}.`]
      : [];
  const storeFiles = adapter.knowledgeStores.map((store: PluginKnowledgeStore) => [store, io.readJson(resolve(project, store.file))] as const);
  const problems = [
    ...(binding.kind === "config-error" ? binding.problems : []),
    ...unreadable([visibleFile, legacyFile, ...storeFiles.map(([, file]) => file)]),
    ...locatorConflict,
  ];
  return binding.kind === "facts" && problems.length === 0
    ? {
        kind: "facts",
        facts: {
          ...binding.facts,
          projectStore: visibleStore ?? legacyStore,
          pluginStores: new Map(storeFiles.map(([store, file]) => [store.plugin, storePath(project, file, store.key)])),
        },
      }
    : { kind: "config-error", problems };
};

const report = (io: AdapterCheckIo, adapter: WorkflowAdapter<string>, readiness: Readiness): number => {
  switch (readiness.status) {
    case "ready":
      io.out(JSON.stringify({ ok: true, workflow: adapter.workflow, contractVersion: adapter.contractVersion }));
      return 0;
    case "not-ready":
      io.err(
        JSON.stringify({
          ok: false,
          workflow: adapter.workflow,
          step: readiness.step,
          reason: readiness.reason,
          recovery: readiness.recovery,
        }),
      );
      return 1;
  }
};

const checkRequest = (io: AdapterCheckIo, request: CheckRequest): number => {
  const gathered = gather(io, request);
  switch (gathered.kind) {
    case "config-error":
      return configError(io, gathered.problems);
    case "facts":
      return report(io, request.adapter, checkAdapterReadiness(gathered.facts));
  }
};

/** Runs `agent-plugin adapter-check`: 0 ready, 1 not ready, 2 invalid arguments or configuration. */
export const runAdapterCheck = (io: AdapterCheckIo, argv: readonly string[], cwd: string): number => {
  const parsed = parseAdapterCheck(argv, cwd);
  switch (parsed.kind) {
    case "help":
      io.out(ADAPTER_CHECK_USAGE);
      return 0;
    case "invalid":
      io.err(`${parsed.message}\n\n${ADAPTER_CHECK_USAGE}`);
      return 2;
    case "ok":
      return checkRequest(io, parsed.request);
  }
};

/** Edge interpreter: the real console and filesystem. */
export const NODE_ADAPTER_CHECK_IO: AdapterCheckIo = Object.freeze({
  ...NODE_PLUGIN_FACTS_IO,
  out: (line: string) => console.log(line), // fp-allow: no-ambient-effect
  err: (line: string) => console.error(line), // fp-allow: no-ambient-effect
});

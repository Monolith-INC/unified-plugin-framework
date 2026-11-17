import { resolve } from "node:path";

import {
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
  NODE_PLUGIN_FACTS_IO,
  parseRootArg,
  tokenize,
  type Gathered,
  type JsonFile,
  type PluginFactsIo,
  type PluginRootArg,
} from "./plugin-facts.js";

export const ADAPTER_CHECK_USAGE = `Usage: agent-plugin adapter-check <workflow> --framework <dir> [--plugin-root <dir>]... [--project <dir>]

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

const toRequest = (
  positionals: readonly string[],
  values: { readonly framework?: string; readonly project?: string; readonly "plugin-root"?: readonly string[] },
  cwd: string,
): Parsed => {
  const [workflow, ...extra] = positionals;
  const adapter = workflow === undefined ? undefined : findWorkflow(workflow);
  return extra.length > 0
    ? { kind: "invalid", message: `Unexpected arguments: ${extra.join(" ")}.` }
    : adapter === undefined
      ? { kind: "invalid", message: `Unknown workflow ${JSON.stringify(workflow ?? "")}.` }
      : values.framework === undefined
        ? { kind: "invalid", message: "--framework is required: the framework plugin root whose manifest declares the plugins." }
        : {
            kind: "ok",
            request: {
              adapter,
              framework: resolve(cwd, values.framework),
              project: resolve(cwd, values.project ?? "."),
              pluginRoots: (values["plugin-root"] ?? []).map(parseRootArg(cwd)),
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

/** The binding facts plus the project's knowledge stores. */
const gather = (io: AdapterCheckIo, { adapter, framework, project, pluginRoots }: CheckRequest): Gathered<ReadinessFacts> => {
  const binding = gatherBinding(io, adapter, framework, pluginRoots);
  const projectFile = io.readJson(resolve(project, ".project-knowledge.json"));
  const storeFiles = adapter.knowledgeStores.map((store: PluginKnowledgeStore) => [store, io.readJson(resolve(project, store.file))] as const);
  const problems = [
    ...(binding.kind === "config-error" ? binding.problems : []),
    ...unreadable([projectFile, ...storeFiles.map(([, file]) => file)]),
  ];
  return binding.kind === "facts" && problems.length === 0
    ? {
        kind: "facts",
        facts: {
          ...binding.facts,
          projectStore: storePath(project, projectFile, ["knowledgeRoot"]),
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

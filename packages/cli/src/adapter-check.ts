import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadPluginRoot, type PluginInspection } from "@agent-plugins/core";
import {
  checkAdapterReadiness,
  findWorkflow,
  type PluginKnowledgeStore,
  type Readiness,
  type ReadinessFacts,
  type WorkflowAdapter,
} from "@agent-plugins/workflows";

export const ADAPTER_CHECK_USAGE = `Usage: agent-plugin adapter-check <workflow> --framework <dir> [--plugin-root <dir>]... [--project <dir>]

Exit codes: 0 ready, 1 not ready (prints the failing step), 2 invalid arguments or configuration.`;

/** The effects adapter-check needs, injected so the command logic is testable without a console or disk. */
export interface AdapterCheckIo {
  readonly readJson: (path: string) => JsonFile;
  readonly inspectPlugin: (root: string) => PluginInspection;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export type JsonFile =
  | { readonly kind: "absent" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "unreadable"; readonly path: string };

interface CheckRequest {
  readonly adapter: WorkflowAdapter<string>;
  readonly framework: string;
  readonly project: string;
  readonly pluginRoots: readonly string[];
}

type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ok"; readonly request: CheckRequest };

type Gathered = { readonly kind: "facts"; readonly facts: ReadinessFacts } | { readonly kind: "config-error"; readonly problems: readonly string[] };

const OPTIONS = {
  framework: { type: "string" },
  project: { type: "string" },
  "plugin-root": { type: "string", multiple: true },
  help: { type: "boolean", short: "h" },
} as const;

/** Node's parser throws on unknown or malformed options; turn that into a value at this boundary. */
const tokenize = (argv: readonly string[]) => {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

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
              pluginRoots: (values["plugin-root"] ?? []).map((root) => resolve(cwd, root)),
            },
          };
};

/** Parses `adapter-check` arguments; `cwd` resolves relative paths. */
export const parseAdapterCheck = (argv: readonly string[], cwd: string): Parsed => {
  const tokens = tokenize(argv);
  return typeof tokens === "string"
    ? { kind: "invalid", message: tokens }
    : tokens.values.help === true
      ? { kind: "help" }
      : toRequest(tokens.positionals, tokens.values, cwd);
};

const errorsOf = (label: string, inspection: PluginInspection): readonly string[] =>
  inspection.manifest === undefined
    ? [`${label} has no readable plugin manifest.`]
    : inspection.diagnostics
        .filter(({ severity }) => severity === "error")
        .map(({ code, message, path }) => `${label}: ${code} ${message}${path === undefined ? "" : ` (${path})`}`);

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

/** An installed plugin's skill names: each skill's directory name. */
const skillNames = (inspection: PluginInspection): readonly string[] =>
  (inspection.skills ?? []).map(({ path }) => basename(dirname(path)));

const gather = (io: AdapterCheckIo, { adapter, framework, project, pluginRoots }: CheckRequest): Gathered => {
  const frameworkInspection = io.inspectPlugin(framework);
  const plugins = pluginRoots.map((root) => [root, io.inspectPlugin(root)] as const);
  const projectFile = io.readJson(resolve(project, ".project-knowledge.json"));
  const storeFiles = adapter.knowledgeStores.map((store: PluginKnowledgeStore) => [store, io.readJson(resolve(project, store.file))] as const);
  const problems = [
    ...errorsOf(`Framework ${framework}`, frameworkInspection),
    ...plugins.flatMap(([root, inspection]) => errorsOf(`Plugin root ${root}`, inspection)),
    ...unreadable([projectFile, ...storeFiles.map(([, file]) => file)]),
  ];
  return problems.length > 0
    ? { kind: "config-error", problems }
    : {
        kind: "facts",
        facts: {
          adapter,
          onboarded: frameworkInspection.onboardedPlugins ?? [],
          pluginSkills: new Map(plugins.map(([, inspection]) => [inspection.manifest?.name ?? "", skillNames(inspection)])),
          projectStore: storePath(project, projectFile, ["knowledgeRoot"]),
          pluginStores: new Map(storeFiles.map(([store, file]) => [store.plugin, storePath(project, file, store.key)])),
        },
      };
};

const report = (io: AdapterCheckIo, adapter: WorkflowAdapter<string>, readiness: Readiness): number => {
  switch (readiness.status) {
    case "ready":
      io.out(JSON.stringify({ ok: true, workflow: adapter.workflow, contractVersion: adapter.contractVersion }));
      return 0;
    case "not-ready":
      io.err(JSON.stringify({ ok: false, workflow: adapter.workflow, step: readiness.step, reason: readiness.reason }));
      return 1;
  }
};

const configError = (io: AdapterCheckIo, problems: readonly string[]): number => {
  io.err(`Configuration problems:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  return 2;
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

const readJsonFromDisk = (path: string): JsonFile => {
  if (!existsSync(path)) return { kind: "absent" };
  try {
    return { kind: "value", value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch {
    return { kind: "unreadable", path };
  }
};

/** Edge interpreter: the real console and filesystem. */
export const NODE_ADAPTER_CHECK_IO: AdapterCheckIo = Object.freeze({
  readJson: readJsonFromDisk,
  inspectPlugin: loadPluginRoot,
  out: (line: string) => console.log(line), // fp-allow: no-ambient-effect
  err: (line: string) => console.error(line), // fp-allow: no-ambient-effect
});

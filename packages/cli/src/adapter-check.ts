import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  checkAdapterReadiness,
  loadPluginRoot,
  type PluginInspection,
  type Readiness,
  type WorkflowAdapter,
} from "@agent-plugins/core";
import { WORKFLOWS } from "@agent-plugins/workflows";

export const ADAPTER_CHECK_USAGE = `Usage: agent-plugin adapter-check <workflow> [--framework <dir>] [--plugin-root <dir>]... [--project <dir>]`;

/** The effects adapter-check needs, injected so the command logic stays testable. */
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

type Parsed = { readonly kind: "ok"; readonly request: CheckRequest } | { readonly kind: "invalid"; readonly message: string };

interface Options {
  readonly framework?: string;
  readonly project?: string;
  readonly pluginRoots: readonly string[];
}

const SINGLE_FLAGS: ReadonlyMap<string, "framework" | "project"> = new Map([
  ["--framework", "framework"],
  ["--project", "project"],
]);

/** Folds `--flag value` pairs into options; the first malformed pair stops parsing. */
const parseOptions = (args: readonly string[], options: Options): Options | string => {
  const [flag, value, ...rest] = args;
  const single = flag === undefined ? undefined : SINGLE_FLAGS.get(flag);
  return flag === undefined
    ? options
    : value === undefined || value.startsWith("--")
      ? `Missing value for ${flag}.`
      : flag === "--plugin-root"
        ? parseOptions(rest, { ...options, pluginRoots: [...options.pluginRoots, value] })
        : single === undefined
          ? `Unknown option ${flag}.`
          : options[single] !== undefined
            ? `${flag} may be given once.`
            : parseOptions(rest, { ...options, [single]: value });
};

/** Parses `adapter-check` arguments into a request; `cwd` supplies defaults. */
export const parseAdapterCheck = (argv: readonly string[], cwd: string): Parsed => {
  const [workflow, ...rest] = argv;
  const adapter = workflow === undefined ? undefined : WORKFLOWS[workflow];
  const options = parseOptions(rest, { pluginRoots: [] });
  return adapter === undefined
    ? { kind: "invalid", message: `Unknown workflow ${JSON.stringify(workflow ?? "")}; known: ${Object.keys(WORKFLOWS).join(", ")}.` }
    : typeof options === "string"
      ? { kind: "invalid", message: options }
      : {
          kind: "ok",
          request: {
            adapter,
            framework: resolve(cwd, options.framework ?? "."),
            project: resolve(cwd, options.project ?? "."),
            pluginRoots: options.pluginRoots.map((root) => resolve(cwd, root)),
          },
        };
};

const field = (value: unknown, keys: readonly string[]): unknown =>
  keys.reduce<unknown>(
    (current, key) => (typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined),
    value,
  );

/** A configured store path resolved against the project, or nothing when unset. */
const storeRoot = <K extends string>(key: K, project: string, file: JsonFile, path: readonly string[]): Partial<Record<K, string>> => {
  const value = file.kind === "value" ? field(file.value, path) : undefined;
  return typeof value === "string" && value.trim() !== "" ? ({ [key]: resolve(project, value) } as Record<K, string>) : {};
};

/** An installed plugin's name and the names of its skills (each skill's directory). */
const installedSkills = (inspection: PluginInspection, root: string): readonly [string, readonly string[]] => [
  inspection.manifest?.name ?? basename(root),
  (inspection.skills ?? []).map(({ path }) => basename(dirname(path))),
];

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

const usageError = (io: AdapterCheckIo, message: string): number => {
  io.err(`${message}\n\n${ADAPTER_CHECK_USAGE}`);
  return 2;
};

const checkRequest = (io: AdapterCheckIo, request: CheckRequest): number => {
  const projectConfig = io.readJson(resolve(request.project, ".project-knowledge.json"));
  const reviewConfig = io.readJson(resolve(request.project, ".monolithic-code-review/sources.json"));
  const unreadable = [projectConfig, reviewConfig].flatMap((file) => (file.kind === "unreadable" ? [file.path] : []));
  return unreadable.length > 0
    ? usageError(io, `Could not read valid JSON from ${unreadable.join(", ")}.`)
    : report(
        io,
        request.adapter,
        checkAdapterReadiness({
          adapter: request.adapter,
          onboarded: io.inspectPlugin(request.framework).onboardedPlugins ?? [],
          pluginSkills: new Map(request.pluginRoots.map((root) => installedSkills(io.inspectPlugin(root), root))),
          knowledgeRoots: {
            ...storeRoot("project", request.project, projectConfig, ["knowledgeRoot"]),
            ...storeRoot("review", request.project, reviewConfig, ["knowledge", "root"]),
          },
        }),
      );
};

/** Runs `agent-plugin adapter-check`: 0 ready, 1 not ready, 2 invalid arguments or configuration. */
export const runAdapterCheck = (io: AdapterCheckIo, argv: readonly string[], cwd: string): number => {
  const parsed = parseAdapterCheck(argv, cwd);
  switch (parsed.kind) {
    case "invalid":
      return usageError(io, parsed.message);
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

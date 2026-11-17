import { renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  adapterPlugins,
  checkPluginBinding,
  findWorkflow,
  LOCK_FILE,
  lockText,
  mappingDigest,
  withPin,
  type BindingFacts,
  type InstalledPlugin,
  type PluginPin,
  type WorkflowAdapter,
} from "@agent-plugins/workflows";

import { configError, gatherBinding, parseRootArgs, tokenize, type PluginFactsIo, type PluginRootArg } from "./plugin-facts.js";
import { NODE_PLUGIN_FACTS_IO } from "./plugin-reader.js";

export const UPGRADE_CHECK_USAGE = `Usage: agent-plugin upgrade-check <workflow> --framework <dir> --plugin-root [<plugin>[@<version>]=]<dir>...

Name a plugin that has no manifest, such as a bare skills folder, as <plugin>=<dir>, and give its release as <plugin>@<version>=<dir>.

Checks each candidate plugin version against the workflow adapter and, when every check passes, pins it in the
framework's ${LOCK_FILE}. Exit codes: 0 pinned, 1 a check failed (the lock is unchanged), 2 invalid arguments or
configuration, including a lock that cannot be written.`;

/** Writing a file: done, or why not. */
export type Written = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** The effects upgrade-check needs: the plugin reads, writing the lock, and output. */
export interface UpgradeCheckIo extends PluginFactsIo {
  readonly writeText: (path: string, text: string) => Written;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

interface UpgradeRequest {
  readonly adapter: WorkflowAdapter<string>;
  readonly framework: string;
  readonly pluginRoots: readonly PluginRootArg[];
}

type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ok"; readonly request: UpgradeRequest };

const OPTIONS = {
  framework: { type: "string" },
  "plugin-root": { type: "string", multiple: true },
  help: { type: "boolean", short: "h" },
} as const;

const toRequest = (
  positionals: readonly string[],
  values: { readonly framework?: string; readonly "plugin-root"?: readonly string[] },
  cwd: string,
): Parsed => {
  const [workflow, ...extra] = positionals;
  const adapter = workflow === undefined ? undefined : findWorkflow(workflow);
  const given = values["plugin-root"] ?? [];
  const roots = parseRootArgs(cwd, given);
  return extra.length > 0
    ? { kind: "invalid", message: `Unexpected arguments: ${extra.join(" ")}.` }
    : adapter === undefined
      ? { kind: "invalid", message: `Unknown workflow ${JSON.stringify(workflow ?? "")}.` }
      : values.framework === undefined
        ? { kind: "invalid", message: "--framework is required: the framework plugin root whose manifest declares the plugins." }
        : given.length === 0
          ? { kind: "invalid", message: "--plugin-root is required: the candidate version of each plugin to check." }
          : !roots.ok
            ? { kind: "invalid", message: roots.message }
            : { kind: "ok", request: { adapter, framework: resolve(cwd, values.framework), pluginRoots: roots.roots } };
};

/** Parses `upgrade-check` arguments; `cwd` resolves relative paths. */
export const parseUpgradeCheck = (argv: readonly string[], cwd: string): Parsed => {
  const tokens = tokenize(argv, OPTIONS);
  return typeof tokens === "string"
    ? { kind: "invalid", message: tokens }
    : tokens.values.help === true
      ? { kind: "help" }
      : toRequest(tokens.positionals, tokens.values, cwd);
};

const pinOf = (adapter: WorkflowAdapter<string>, plugin: string, { version, checksum }: InstalledPlugin): PluginPin => ({
  plugin,
  version,
  checksum,
  adapter: adapter.workflow,
  contractVersion: adapter.contractVersion,
  mappingDigest: mappingDigest(adapter),
});

/** The pins a passing check produces: one per plugin the adapter references, all of them installed by then. */
const pinsFor = ({ adapter, installed }: BindingFacts): readonly PluginPin[] =>
  adapterPlugins(adapter).flatMap((plugin) => {
    const found = installed.get(plugin);
    return found === undefined ? [] : [pinOf(adapter, plugin, found)];
  });

const reportPinned = (io: UpgradeCheckIo, workflow: string, path: string, changed: boolean, pins: readonly PluginPin[]): number => {
  io.out(
    JSON.stringify({
      ok: true,
      workflow,
      lock: path,
      changed,
      pinned: pins.map(({ plugin, version, checksum }) => ({ plugin, version, checksum })),
    }),
  );
  return 0;
};

const pin = (io: UpgradeCheckIo, framework: string, binding: BindingFacts): number => {
  const pins = pinsFor(binding);
  const path = join(framework, LOCK_FILE);
  const before = lockText(binding.lock);
  const after = lockText(pins.reduce(withPin, binding.lock));
  // Effect: the lock is written only after every check passed.
  const written = io.writeText(path, after);
  return written.ok
    ? reportPinned(io, binding.adapter.workflow, path, before !== after, pins)
    : configError(io, [`Could not write ${path}: ${written.message}. The lock is unchanged.`]);
};

const decide = (io: UpgradeCheckIo, request: UpgradeRequest, binding: BindingFacts): number => {
  const readiness = checkPluginBinding(binding);
  switch (readiness.status) {
    case "ready":
      return pin(io, request.framework, binding);
    case "not-ready":
      io.err(
        JSON.stringify({
          ok: false,
          workflow: request.adapter.workflow,
          step: readiness.step,
          reason: readiness.reason,
          recovery: readiness.recovery,
          lock: "unchanged",
        }),
      );
      return 1;
  }
};

const checkRequest = (io: UpgradeCheckIo, request: UpgradeRequest): number => {
  const gathered = gatherBinding(io, request.adapter, request.framework, request.pluginRoots);
  switch (gathered.kind) {
    case "config-error":
      return configError(io, gathered.problems);
    case "facts":
      return decide(io, request, gathered.facts);
  }
};

/** Runs `agent-plugin upgrade-check`: 0 pinned, 1 a check failed, 2 invalid arguments or configuration. */
export const runUpgradeCheck = (io: UpgradeCheckIo, argv: readonly string[], cwd: string): number => {
  const parsed = parseUpgradeCheck(argv, cwd);
  switch (parsed.kind) {
    case "help":
      io.out(UPGRADE_CHECK_USAGE);
      return 0;
    case "invalid":
      io.err(`${parsed.message}\n\n${UPGRADE_CHECK_USAGE}`);
      return 2;
    case "ok":
      return checkRequest(io, parsed.request);
  }
};

/** Edge interpreter: writes beside the target and renames over it, so an interrupted write never leaves half a lock. */
const writeTextToDisk = (path: string, text: string): Written => {
  const staged = `${path}.tmp`;
  try {
    writeFileSync(staged, text); // fp-allow: no-ambient-effect
    renameSync(staged, path); // fp-allow: no-ambient-effect
    return { ok: true };
  } catch (error) {
    rmSync(staged, { force: true }); // fp-allow: no-ambient-effect
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
};

/** Edge interpreter: the real console and filesystem. */
export const NODE_UPGRADE_CHECK_IO: UpgradeCheckIo = Object.freeze({
  ...NODE_PLUGIN_FACTS_IO,
  writeText: writeTextToDisk,
  out: (line: string) => console.log(line), // fp-allow: no-ambient-effect
  err: (line: string) => console.error(line), // fp-allow: no-ambient-effect
});

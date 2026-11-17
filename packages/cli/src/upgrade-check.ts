import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

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
  type OnboardedLock,
  type PluginPin,
  type WorkflowAdapter,
} from "@agent-plugins/workflows";

import { errorsOf, installedFrom, lockFrom, NODE_PLUGIN_FACTS_IO, type Gathered, type PluginFactsIo } from "./plugin-facts.js";

export const UPGRADE_CHECK_USAGE = `Usage: agent-plugin upgrade-check <workflow> --framework <dir> --plugin-root <dir>...

Checks each candidate plugin version against the workflow adapter and, when every check passes, pins it in the
framework's ${LOCK_FILE}. Exit codes: 0 pinned, 1 a check failed (the lock is unchanged), 2 invalid arguments or
configuration.`;

/** The effects upgrade-check needs: the plugin reads, writing the lock, and output. */
export interface UpgradeCheckIo extends PluginFactsIo {
  readonly writeText: (path: string, text: string) => void;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

interface UpgradeRequest {
  readonly adapter: WorkflowAdapter<string>;
  readonly framework: string;
  readonly pluginRoots: readonly string[];
}

type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ok"; readonly request: UpgradeRequest };

interface UpgradeFacts {
  readonly binding: BindingFacts;
  readonly lock: OnboardedLock;
}

const OPTIONS = {
  framework: { type: "string" },
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
  values: { readonly framework?: string; readonly "plugin-root"?: readonly string[] },
  cwd: string,
): Parsed => {
  const [workflow, ...extra] = positionals;
  const adapter = workflow === undefined ? undefined : findWorkflow(workflow);
  const roots = values["plugin-root"] ?? [];
  return extra.length > 0
    ? { kind: "invalid", message: `Unexpected arguments: ${extra.join(" ")}.` }
    : adapter === undefined
      ? { kind: "invalid", message: `Unknown workflow ${JSON.stringify(workflow ?? "")}.` }
      : values.framework === undefined
        ? { kind: "invalid", message: "--framework is required: the framework plugin root whose manifest declares the plugins." }
        : roots.length === 0
          ? { kind: "invalid", message: "--plugin-root is required: the candidate version of each plugin to check." }
          : {
              kind: "ok",
              request: { adapter, framework: resolve(cwd, values.framework), pluginRoots: roots.map((root) => resolve(cwd, root)) },
            };
};

/** Parses `upgrade-check` arguments; `cwd` resolves relative paths. */
export const parseUpgradeCheck = (argv: readonly string[], cwd: string): Parsed => {
  const tokens = tokenize(argv);
  return typeof tokens === "string"
    ? { kind: "invalid", message: tokens }
    : tokens.values.help === true
      ? { kind: "help" }
      : toRequest(tokens.positionals, tokens.values, cwd);
};

const gather = (io: UpgradeCheckIo, { adapter, framework, pluginRoots }: UpgradeRequest): Gathered<UpgradeFacts> => {
  const frameworkInspection = io.inspectPlugin(framework);
  const plugins = installedFrom(io, pluginRoots);
  const locked = lockFrom(io, framework);
  const problems = [...errorsOf(`Framework ${framework}`, frameworkInspection), ...plugins.problems, ...locked.problems];
  return problems.length > 0
    ? { kind: "config-error", problems }
    : {
        kind: "facts",
        facts: {
          binding: { adapter, onboarded: frameworkInspection.onboardedPlugins ?? [], installed: plugins.installed },
          lock: locked.lock,
        },
      };
};

const pinOf = (adapter: WorkflowAdapter<string>, plugin: string, { version, checksum }: InstalledPlugin): PluginPin => ({
  plugin,
  version,
  checksum,
  adapter: adapter.workflow,
  contractVersion: adapter.contractVersion,
  mappingDigest: mappingDigest(adapter),
});

/** The pins a passing check produces: one per plugin the adapter references. */
const pinsFor = ({ adapter, installed }: BindingFacts): readonly PluginPin[] =>
  adapterPlugins(adapter).flatMap((plugin) => {
    const found = installed.get(plugin);
    return found === undefined ? [] : [pinOf(adapter, plugin, found)];
  });

const pin = (io: UpgradeCheckIo, framework: string, { binding, lock }: UpgradeFacts): number => {
  const pins = pinsFor(binding);
  const before = lockText(lock);
  const after = lockText(pins.reduce(withPin, lock));
  // Effect: the lock is written only after every check passed.
  io.writeText(join(framework, LOCK_FILE), after);
  io.out(
    JSON.stringify({
      ok: true,
      workflow: binding.adapter.workflow,
      lock: join(framework, LOCK_FILE),
      changed: before !== after,
      pinned: pins.map(({ plugin, version, checksum }) => ({ plugin, version, checksum })),
    }),
  );
  return 0;
};

const decide = (io: UpgradeCheckIo, request: UpgradeRequest, facts: UpgradeFacts): number => {
  const readiness = checkPluginBinding(facts.binding);
  switch (readiness.status) {
    case "ready":
      return pin(io, request.framework, facts);
    case "not-ready":
      io.err(
        JSON.stringify({
          ok: false,
          workflow: request.adapter.workflow,
          step: readiness.step,
          reason: readiness.reason,
          lock: "unchanged",
        }),
      );
      return 1;
  }
};

const checkRequest = (io: UpgradeCheckIo, request: UpgradeRequest): number => {
  const gathered = gather(io, request);
  switch (gathered.kind) {
    case "config-error":
      io.err(`Configuration problems:\n${gathered.problems.map((problem) => `- ${problem}`).join("\n")}`);
      return 2;
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

/** Edge interpreter: the real console and filesystem. */
export const NODE_UPGRADE_CHECK_IO: UpgradeCheckIo = Object.freeze({
  ...NODE_PLUGIN_FACTS_IO,
  writeText: (path: string, text: string) => writeFileSync(path, text), // fp-allow: no-ambient-effect
  out: (line: string) => console.log(line), // fp-allow: no-ambient-effect
  err: (line: string) => console.error(line), // fp-allow: no-ambient-effect
});

#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runProject } from "./project.js";

import { claudeAdapter, claudeShippedBundle } from "@agent-plugins/adapter-claude";
import { codexAdapter, codexShippedBundle } from "@agent-plugins/adapter-codex";
import { cursorAdapter, cursorShippedBundle } from "@agent-plugins/adapter-cursor";
import {
  normalizeCanonicalPlugin,
  parseVendorId,
  readVendorBundle,
  type CanonicalPlugin,
  type InstallResult,
  type Result,
  type VendorAdapter,
  type VendorBundle,
  type VendorId,
} from "@agent-plugins/compiler";

import {
  addSkillScaffold,
  createPluginScaffold,
  loadPluginRoot,
  pluginDirectoryName,
  type AuthoringResult,
  type PluginInspection,
} from "@agent-plugins/core";
import type { Diagnostic } from "@agent-plugins/core";
import { installVendorBundle } from "@agent-plugins/installer";
import { SHIPPED_PLUGINS, withAssembledSource } from "@agent-plugins/workflows";

import { NODE_ADAPTER_CHECK_IO, runAdapterCheck } from "./adapter-check.js";
import { NODE_UPGRADE_CHECK_IO, runUpgradeCheck } from "./upgrade-check.js";

const USAGE = `Usage: agent-plugin <command> [options]

Commands:
  validate [path]                   Validate a plugin root (defaults to cwd)
  inspect  [path]                   Inspect portable components as JSON (defaults to cwd)
  install <plugin> --vendor <claude|cursor|codex> --target <directory>
                                    Install one shipped vendor payload transactionally
  create <plugin-name> [--path dir] Scaffold a portable plugin root
  add skill <skill-name> [--path dir]
                                    Add an immediate-child Skill to a plugin root
  adapter-check <workflow> --framework dir [--plugin-root [plugin[@version]=]dir]... [--project dir]
                                    Check a workflow adapter's readiness (declared, installed, bound)
  upgrade-check <workflow> --framework dir --plugin-root [plugin[@version]=]dir...
                                    Check candidate plugin versions against the adapter and pin them
  project describe|setup|request|bootstrap
                                    Use project operations or plan/apply accepted tooling setup
`;

const CREATE_USAGE = `Usage: agent-plugin create <plugin-name> [--path <dir>]`;
const ADD_SKILL_USAGE = `Usage: agent-plugin add skill <skill-name> [--path <plugin-root>]`;
const INSTALL_USAGE = `Usage: agent-plugin install <plugin> --vendor <claude|cursor|codex> --target <directory>`;

/** The effects every command needs, injected so commands are testable without a real console or process. */
export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly cwd: () => string;
}

/** Edge interpreter: the real console and working directory. */
export const NODE_CLI_IO: CliIo = Object.freeze({
  out: (line: string) => console.log(line), // fp-allow: no-ambient-effect
  err: (line: string) => console.error(line), // fp-allow: no-ambient-effect
  cwd: () => process.cwd(), // fp-allow: no-ambient-effect
});

export function run(argv: readonly string[], io: CliIo = NODE_CLI_IO): number | Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "project":
      return runProject(rest, io);
    case "validate":
      return isHelpToken(rest[0]) ? printUsage(io, 0) : validatePlugin(io, resolve(io.cwd(), rest[0] ?? "."));
    case "inspect":
      return isHelpToken(rest[0]) ? printUsage(io, 0) : printInspection(io, loadPluginRoot(resolve(io.cwd(), rest[0] ?? ".")));
    case "create":
      return runCreate(io, rest);
    case "add":
      return runAdd(io, rest);
    case "install":
      return runInstallCommand(rest, DEFAULT_INSTALL_RUNTIME, io);
    case "adapter-check":
      return runAdapterCheck(NODE_ADAPTER_CHECK_IO, rest, io.cwd());
    case "upgrade-check":
      return runUpgradeCheck(NODE_UPGRADE_CHECK_IO, rest, io.cwd());
    case "help":
    case "--help":
    case "-h":
    case undefined:
      return printUsage(io, 0);
    default:
      return printError(io, `Unknown command: ${command}\n\n${USAGE.trimEnd()}`, 1);
  }
}

export interface InstallCommandRuntime {
  readonly resolve: (plugin: string, vendor: VendorId) => Result<{ readonly bundle: VendorBundle; readonly adapter: VendorAdapter }>;
  readonly install: typeof installVendorBundle;
}

const DEFAULT_INSTALL_RUNTIME: InstallCommandRuntime = Object.freeze({
  resolve: (plugin: string, vendor: VendorId) => resolveShippedBundle(plugin, vendor),
  install: installVendorBundle,
});

type InstallRequest = { readonly plugin: string; readonly vendor: VendorId; readonly target: string };

export function runInstallCommand(
  argv: readonly string[],
  runtime: InstallCommandRuntime = DEFAULT_INSTALL_RUNTIME,
  io: CliIo = NODE_CLI_IO,
): number {
  const parsed = parseInstallArguments(argv, io.cwd());
  return argv.some(isHelpToken)
    ? printText(io, INSTALL_USAGE, 0)
    : parsed.ok
      ? installSafely(io, runtime, parsed.value)
      : printError(io, JSON.stringify({ ok: false, outcome: "invalid-arguments", diagnostics: parsed.diagnostics }), 2);
}

/** Runs the install; an unexpected platform failure is reported without its details, never thrown. */
function installSafely(io: CliIo, runtime: InstallCommandRuntime, request: InstallRequest): number {
  try {
    return resolveAndInstall(io, runtime, request);
  } catch {
    return printInstallFailure(io, "failed-before-mutation", [cliDiagnostic("cli.unexpected", "Unexpected platform failure.")], 70);
  }
}

function resolveAndInstall(io: CliIo, runtime: InstallCommandRuntime, { plugin, vendor, target }: InstallRequest): number {
  const resolved = runtime.resolve(plugin, vendor);
  const root = resolve(io.cwd(), target);
  return resolved.ok
    ? printInstallResult(io, runtime.install({ bundle: resolved.value.bundle, adapter: resolved.value.adapter, target: { root } }), root)
    : printInstallFailure(io, "failed-before-mutation", resolved.diagnostics, 3);
}

/** The `--vendor`/`--target` pairs after the plugin, read until the first malformed or repeated one. */
type OptionScan = { readonly options: ReadonlyMap<string, string>; readonly invalid: boolean };

const scanOption =
  (argv: readonly string[]) =>
  (scan: OptionScan, index: number): OptionScan => {
    const option = argv[index];
    const value = argv[index + 1];
    return scan.invalid
      ? scan
      : (option !== "--vendor" && option !== "--target") || value === undefined || value.startsWith("--") || scan.options.has(option)
        ? { options: scan.options, invalid: true }
        : { options: new Map([...scan.options, [option, value]]), invalid: false };
  };

/** Indexes 1, 3, 5, ... below the argument count: where each option name sits. */
const optionIndexes = (argv: readonly string[]): readonly number[] =>
  Array.from({ length: Math.max(0, Math.ceil((argv.length - 1) / 2)) }, (_, pair) => 1 + 2 * pair);

function parseInstallArguments(argv: readonly string[], cwd: string): Result<InstallRequest> {
  const plugin = argv[0];
  const scan = optionIndexes(argv).reduce<OptionScan>(scanOption(argv), { options: new Map(), invalid: false });
  const rawVendor = scan.options.get("--vendor");
  const vendor = rawVendor === undefined ? undefined : parseVendorId(rawVendor);
  const target = scan.options.get("--target");
  const diagnostics: readonly Diagnostic[] = [
    ...(plugin === undefined || plugin.startsWith("-") ? [cliDiagnostic("cli.arguments.plugin", "Exactly one plugin path is required.")] : []),
    ...(scan.invalid ? [cliDiagnostic("cli.arguments.invalid", "Install arguments must contain one --vendor and one --target.")] : []),
    ...(argv.length !== 5 || scan.options.size !== 2 ? [cliDiagnostic("cli.arguments.count", "Install accepts no extra or missing arguments.")] : []),
    ...(vendor === undefined || !vendor.ok ? [cliDiagnostic("cli.arguments.vendor", "Vendor must be exactly claude, cursor, or codex.")] : []),
    ...(target === undefined ? [cliDiagnostic("cli.arguments.target", "Exactly one target directory is required.")] : []),
  ];
  const [first, ...rest] = diagnostics;
  return first !== undefined || plugin === undefined || vendor === undefined || !vendor.ok || target === undefined
    ? { ok: false, diagnostics: [first ?? cliDiagnostic("cli.arguments.invalid", "Install arguments are invalid."), ...rest] }
    : { ok: true, value: { plugin: resolve(cwd, plugin), vendor: vendor.value, target } };
}

export function resolveShippedBundle(pluginRoot: string, vendor: VendorId): Result<{ readonly bundle: VendorBundle; readonly adapter: VendorAdapter }> {
  const inspection = loadPluginRoot(pluginRoot);
  const errors = inspection.diagnostics.filter((entry) => entry.severity === "error");
  if (inspection.manifest === undefined || errors.length > 0) {
    const diagnostics = errors.length > 0 ? errors : [cliDiagnostic("cli.plugin.invalid", "Plugin distribution has no valid manifest.", pluginRoot)];
    return { ok: false, diagnostics: [diagnostics[0] as Diagnostic, ...diagnostics.slice(1)] };
  }
  const selected = SHIPPED_ADAPTERS[vendor];
  const location = fileURLToPath(selected.bundle(pluginDirectoryName(inspection.manifest.name)));
  const bundle = existsSync(location) ? readVendorBundle(location) : missingPayload(vendor, inspection.manifest.name, location);
  return bundle.ok ? checkSourceDrift(pluginRoot, vendor, location, bundle.value, selected.adapter) : bundle;
}

const SHIPPED_ADAPTERS: Readonly<Record<VendorId, { readonly adapter: VendorAdapter; readonly bundle: (name: string) => URL }>> = Object.freeze({
  claude: { adapter: claudeAdapter, bundle: claudeShippedBundle },
  codex: { adapter: codexAdapter, bundle: codexShippedBundle },
  cursor: { adapter: cursorAdapter, bundle: cursorShippedBundle },
});

const REBUILD = "Rebuild the shipped payloads with `pnpm payloads:build`, then install again.";

const SHIPPED: ReadonlySet<string> = new Set(SHIPPED_PLUGINS);

const NOT_SHIPPED = "Add it to `SHIPPED_PLUGINS` in packages/workflows/src/release.ts, build with `pnpm payloads:build`, then install again.";

const missingPayload = (vendor: VendorId, name: string, location: string): Result<VendorBundle> => ({
  ok: false,
  diagnostics: [
    cliDiagnostic(
      "cli.payload.missing",
      `No shipped ${vendor} payload exists for ${name}. ${SHIPPED.has(pluginDirectoryName(name)) ? REBUILD : NOT_SHIPPED}`,
      location,
    ),
  ],
});

/** The plugin as released: its templates assembled, in a temporary copy that is removed once read. */
const releasedSource = (pluginRoot: string): Result<CanonicalPlugin> => {
  const staged = withAssembledSource(pluginRoot, normalizeCanonicalPlugin);
  const [first, ...rest] = staged.ok ? [] : staged.problems.map((problem) => cliDiagnostic("cli.plugin.assembly", problem, pluginRoot));
  return staged.ok ? staged.value : { ok: false, diagnostics: [first ?? cliDiagnostic("cli.plugin.assembly", "Plugin could not be assembled.", pluginRoot), ...rest] };
};

const sourceDrift = (vendor: VendorId, location: string, bundle: VendorBundle): Result<never> => ({
  ok: false,
  diagnostics: [cliDiagnostic("cli.payload.drift", `The shipped ${vendor} payload for ${bundle.manifest.plugin.name} no longer matches its source. ${REBUILD}`, location)],
});

/** Refuses a shipped payload built from a different source than the plugin being installed. */
const checkSourceDrift = (
  pluginRoot: string,
  vendor: VendorId,
  location: string,
  bundle: VendorBundle,
  adapter: VendorAdapter,
): Result<{ readonly bundle: VendorBundle; readonly adapter: VendorAdapter }> => {
  const released = releasedSource(pluginRoot);
  return !released.ok
    ? released
    : released.value.sourceDigest === bundle.manifest.sourceDigest
      ? { ok: true, value: { bundle, adapter } }
      : sourceDrift(vendor, location, bundle);
};

function printInstallResult(io: CliIo, result: InstallResult, target: string): number {
  switch (result.kind) {
    case "installed":
    case "unchanged":
      return printText(
        io,
        JSON.stringify({
          ok: true,
          outcome: result.kind,
          plugin: result.record.plugin,
          version: result.record.version,
          vendor: result.record.vendor,
          adapterVersion: result.record.adapterVersion,
          payloadDigest: result.record.payloadDigest,
          target,
          changedPaths: result.changedPaths,
        }),
        0,
      );
    case "failed-before-mutation":
      return printInstallFailure(io, result.kind, result.diagnostics, 3);
    case "rolled-back":
      return printInstallFailure(io, result.kind, result.diagnostics, 4);
    case "rollback-failed":
      return printInstallFailure(io, result.kind, result.diagnostics, 5, result.recoveryJournal);
  }
}

function printInstallFailure(io: CliIo, outcome: string, diagnostics: readonly Diagnostic[], exitCode: number, recoveryJournal?: string): number {
  return printError(io, JSON.stringify({ ok: false, outcome, diagnostics, ...(recoveryJournal === undefined ? {} : { recoveryJournal }) }), exitCode);
}

function cliDiagnostic(code: string, message: string, path?: string): Diagnostic {
  return { severity: "error", code, message, ...(path === undefined ? {} : { path }) };
}

function runCreate(io: CliIo, argv: readonly string[]): number {
  const parsed = parseNameAndPath(argv);
  return argv.some(isHelpToken) ? printText(io, CREATE_USAGE, 0) : createFrom(io, parsed);
}

function createFrom(io: CliIo, parsed: ParsedNamePath): number {
  switch (parsed.kind) {
    case "missing-name":
      return printError(io, CREATE_USAGE, 1);
    case "missing-path-value":
      return printError(io, `Missing value for --path\n\n${CREATE_USAGE}`, 1);
    case "ok": {
      const destination = parsed.path ?? resolve(io.cwd(), pluginDirectoryName(parsed.name));
      return printAuthoring(
        io,
        createPluginScaffold({ name: parsed.name, destination: resolve(io.cwd(), destination), rawDestination: parsed.rawPath ?? destination }),
        parsed.name,
      );
    }
  }
}

function runAdd(io: CliIo, argv: readonly string[]): number {
  switch (argv[0]) {
    case "skill":
      return runAddSkill(io, argv.slice(1));
    case "help":
    case "--help":
    case "-h":
      return printText(io, ADD_SKILL_USAGE, 0);
    case undefined:
      return printError(io, ADD_SKILL_USAGE, 1);
    default:
      return printError(io, `Unknown add target: ${argv[0]}\n\n${ADD_SKILL_USAGE}`, 1);
  }
}

function runAddSkill(io: CliIo, argv: readonly string[]): number {
  const parsed = parseNameAndPath(argv);
  return argv.some(isHelpToken) ? printText(io, ADD_SKILL_USAGE, 0) : addSkillFrom(io, parsed);
}

function addSkillFrom(io: CliIo, parsed: ParsedNamePath): number {
  switch (parsed.kind) {
    case "missing-name":
      return printError(io, ADD_SKILL_USAGE, 1);
    case "missing-path-value":
      return printError(io, `Missing value for --path\n\n${ADD_SKILL_USAGE}`, 1);
    case "ok": {
      const pluginRoot = parsed.path ?? io.cwd();
      return printAuthoring(
        io,
        addSkillScaffold({ skillName: parsed.name, pluginRoot: resolve(io.cwd(), pluginRoot), rawPluginRoot: parsed.rawPath ?? pluginRoot }),
        parsed.name,
      );
    }
  }
}

type ParsedNamePath =
  | { readonly kind: "missing-name" }
  | { readonly kind: "missing-path-value" }
  | {
      readonly kind: "ok";
      readonly name: string;
      readonly path?: string;
      readonly rawPath?: string;
    };

function parseNameAndPath(argv: readonly string[]): ParsedNamePath {
  const pathIndex = argv.findIndex((token) => token === "--path");
  const rawPath = pathIndex === -1 ? undefined : argv[pathIndex + 1];
  const name = pathIndex === -1 ? argv[0] : argv.filter((_, index) => index !== pathIndex && index !== pathIndex + 1)[0];
  return pathIndex !== -1 && rawPath === undefined
    ? { kind: "missing-path-value" }
    : name === undefined
      ? { kind: "missing-name" }
      : rawPath === undefined
        ? { kind: "ok", name }
        : { kind: "ok", name, path: rawPath, rawPath };
}

function printAuthoring(io: CliIo, result: AuthoringResult, name: string): number {
  return result.diagnostics.length === 0
    ? printText(
        io,
        JSON.stringify(
          { ok: true, path: result.path, name: result.name ?? name, ...(result.nextSteps === undefined ? {} : { nextSteps: result.nextSteps }) },
          null,
          2,
        ),
        0,
      )
    : printError(io, JSON.stringify(result.diagnostics, null, 2), 1);
}

function isHelpToken(token: string | undefined): boolean {
  switch (token) {
    case "help":
    case "--help":
    case "-h":
      return true;
    default:
      return false;
  }
}

function printUsage(io: CliIo, exitCode: number): number {
  return printText(io, USAGE.trimEnd(), exitCode);
}

function printText(io: CliIo, text: string, exitCode: number): number {
  io.out(text);
  return exitCode;
}

function printError(io: CliIo, text: string, exitCode: number): number {
  io.err(text);
  return exitCode;
}

function validatePlugin(io: CliIo, pluginPath: string): number {
  const inspection = loadPluginRoot(pluginPath);
  return inspection.diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? printError(io, JSON.stringify(inspection.diagnostics, null, 2), 1)
    : printText(io, JSON.stringify({ ok: true }), 0);
}

function printInspection(io: CliIo, inspection: PluginInspection): number {
  return printText(io, JSON.stringify(inspection, null, 2), inspection.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0);
}

function isCliEntrypoint(entrypoint: string | undefined, moduleUrl: string): boolean {
  return entrypoint !== undefined && entrypoint !== "" && toRealPath(entrypoint) === toRealPath(fileURLToPath(moduleUrl));
}

function toRealPath(path: string): string {
  return realpathSync(resolve(path));
}

// Edge: the program's one effectful invocation, when this module is run as the CLI.
if (isCliEntrypoint(process.argv[1], import.meta.url)) process.exit(await run(process.argv.slice(2))); // fp-allow: no-ambient-effect

#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { claudeStateFile } from "./host-table.js";
import { runProject } from "./project.js";

import { failure, parseVendorId, success, type InstallResult, type Result, type VendorId } from "@agent-plugins/compiler";
import { andThen, failureOf } from "@agent-plugins/compiler/railway";

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

import { NODE_ADAPTER_CHECK_IO, runAdapterCheck } from "./adapter-check.js";
import { bundleResolver, type BundleSource, type ResolvedBundle } from "./bundle-source.js";
import { RELEASE_VERSION } from "./release-asset.js";
import { nodeFetchBytes, releaseBaseUrl } from "./release-download.js";
import { NODE_UPGRADE_CHECK_IO, runUpgradeCheck } from "./upgrade-check.js";

const USAGE = `Usage: agent-plugin <command> [options]

Commands:
  validate [path]                   Validate a plugin root (defaults to cwd)
  inspect  [path]                   Inspect portable components as JSON (defaults to cwd)
  install <plugin> --version <version> --vendor <claude|cursor|codex> --target <directory>
                                    Download a released host payload, verify it, install it transactionally
  install --source <plugin-directory> --vendor <claude|cursor|codex> --target <directory>
                                    Build a host payload from a source directory and install it (development)
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
const INSTALL_USAGE = `Usage: agent-plugin install <plugin> --version <version> --vendor <claude|cursor|codex> --target <directory>
       agent-plugin install --source <plugin-directory> --vendor <claude|cursor|codex> --target <directory>

With --version, downloads <plugin>'s payload for the host from that GitHub release, checks it against the release's
SHA256SUMS, then installs it. With --source, builds the payload from a plugin source directory (development).`;

/** The effects every command needs, injected so commands are testable without a real console or process. */
export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly cwd: () => string;
  /** Claude Code's user state file, where it keeps local-scope servers for each project. */
  readonly claudeState: () => string;
}

/** Edge interpreter: the real console and working directory. */
export const NODE_CLI_IO: CliIo = Object.freeze({
  out: (line: string) => console.log(line), // fp-allow: no-ambient-effect
  err: (line: string) => console.error(line), // fp-allow: no-ambient-effect
  cwd: () => process.cwd(), // fp-allow: no-ambient-effect
  claudeState: () => claudeStateFile(homedir(), process.env["CLAUDE_CONFIG_DIR"]), // fp-allow: no-ambient-effect
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
  readonly resolve: (source: BundleSource) => Promise<ResolvedBundle>;
  readonly install: typeof installVendorBundle;
}

const DEFAULT_INSTALL_RUNTIME: InstallCommandRuntime = Object.freeze({
  resolve: (source: BundleSource) => bundleResolver(nodeFetchBytes, releaseBaseUrl())(source),
  install: installVendorBundle,
});

type InstallRequest = { readonly source: BundleSource; readonly target: string };

export function runInstallCommand(
  argv: readonly string[],
  runtime: InstallCommandRuntime = DEFAULT_INSTALL_RUNTIME,
  io: CliIo = NODE_CLI_IO,
): Promise<number> {
  const parsed = parseInstallArguments(argv, io.cwd());
  return argv.some(isHelpToken)
    ? Promise.resolve(printText(io, INSTALL_USAGE, 0))
    : parsed.ok
      ? installFrom(io, runtime, parsed.value)
      : Promise.resolve(printError(io, JSON.stringify({ ok: false, outcome: "invalid-arguments", diagnostics: parsed.diagnostics }), 2));
}

const unexpectedFailure = (io: CliIo): number =>
  printInstallFailure(io, "failed-before-mutation", [cliDiagnostic("cli.unexpected", "Unexpected platform failure.")], 70);

/** One channel for every outcome: a resolver or installer that throws or rejects is reported without its details. */
const installFrom = (io: CliIo, runtime: InstallCommandRuntime, { source, target }: InstallRequest): Promise<number> =>
  Promise.resolve(source)
    .then((selected) => runtime.resolve(selected))
    .then((resolved) => installResolved(io, runtime, target, resolved))
    .catch(() => unexpectedFailure(io));

function installResolved(io: CliIo, runtime: InstallCommandRuntime, target: string, resolved: ResolvedBundle): number {
  const root = resolve(io.cwd(), target);
  return resolved.ok
    ? printInstallResult(io, runtime.install({ bundle: resolved.value.bundle, adapter: resolved.value.adapter, target: { root } }), root)
    : printInstallFailure(io, "failed-before-mutation", resolved.diagnostics, 3);
}

/** The option pairs, read until the first malformed or repeated one. */
type OptionScan = { readonly options: ReadonlyMap<string, string>; readonly invalid: boolean };

const INSTALL_OPTIONS: ReadonlySet<string> = new Set(["--vendor", "--target", "--version", "--source"]);

const scanOption =
  (argv: readonly string[]) =>
  (scan: OptionScan, index: number): OptionScan => {
    const option = argv[index];
    const value = argv[index + 1];
    return scan.invalid
      ? scan
      : option === undefined || !INSTALL_OPTIONS.has(option) || value === undefined || value.startsWith("--") || scan.options.has(option)
        ? { options: scan.options, invalid: true }
        : { options: new Map([...scan.options, [option, value]]), invalid: false };
  };

/** Indexes 0, 2, 4, ... below the argument count: where each option name sits. */
const pairIndexes = (argv: readonly string[]): readonly number[] => Array.from({ length: Math.ceil(argv.length / 2) }, (_, pair) => 2 * pair);

/** `<plugin>` when the first argument is not an option. */
const positionalOf = (argv: readonly string[]): string | undefined => {
  const first = argv[0];
  return first !== undefined && !first.startsWith("-") ? first : undefined;
};

/** A released plugin is named by its directory name, never by a path. */
const RELEASED_PLUGIN = /^[a-z0-9][a-z0-9-]*$/u;

const nameDiagnostics = (plugin: string | undefined, version: string | undefined): readonly Diagnostic[] => [
  ...(version === undefined || RELEASE_VERSION.test(version)
    ? []
    : [cliDiagnostic("cli.arguments.version", "Version must look like 0.2.0, v0.2.0 or v0.2.0-rc.1.")]),
  ...(plugin === undefined || RELEASED_PLUGIN.test(plugin)
    ? []
    : [cliDiagnostic("cli.arguments.plugin", "Name a released plugin such as unified-plugin-framework; for a plugin directory use --source <dir>.")]),
];

const MODE_HINT = "Install a released plugin with <plugin> --version <version>, or a plugin directory with --source <dir>; not both.";

/** Exactly one mode: a released plugin and its version, or a source directory alone. */
const bundleSource = (
  arguments_: { readonly plugin: string | undefined; readonly version: string | undefined; readonly source: string | undefined },
  vendor: VendorId,
  cwd: string,
): Result<BundleSource> => {
  const { plugin, version, source } = arguments_;
  return plugin !== undefined && version !== undefined && source === undefined
    ? success({ kind: "release", plugin, version, vendor })
    : plugin === undefined && version === undefined && source !== undefined
      ? success({ kind: "source", root: resolve(cwd, source), vendor })
      : failure(
          cliDiagnostic(
            "cli.arguments.mode",
            plugin !== undefined && version === undefined && source === undefined
              ? `Add --version <version> to install the released ${plugin}, or use --source <dir> to build a plugin directory.`
              : MODE_HINT,
          ),
        );
};

function parseInstallArguments(argv: readonly string[], cwd: string): Result<InstallRequest> {
  const plugin = positionalOf(argv);
  const optionArgs = plugin === undefined ? argv : argv.slice(1);
  const scan = pairIndexes(optionArgs).reduce<OptionScan>(scanOption(optionArgs), { options: new Map(), invalid: false });
  const rawVendor = scan.options.get("--vendor");
  const vendor = rawVendor === undefined ? undefined : parseVendorId(rawVendor);
  const target = scan.options.get("--target");
  const version = scan.options.get("--version");
  const diagnostics: readonly Diagnostic[] = [
    ...(scan.invalid ? [cliDiagnostic("cli.arguments.invalid", "Install options are --vendor, --target, and --version or --source, each at most once.")] : []),
    ...(optionArgs.length !== 2 * scan.options.size || !scan.options.has("--vendor") || !scan.options.has("--target")
      ? [cliDiagnostic("cli.arguments.count", "Install accepts no extra or missing arguments.")]
      : []),
    ...(vendor === undefined || !vendor.ok ? [cliDiagnostic("cli.arguments.vendor", "Vendor must be exactly claude, cursor, or codex.")] : []),
    ...(target === undefined ? [cliDiagnostic("cli.arguments.target", "Exactly one target directory is required.")] : []),
    ...nameDiagnostics(plugin, version),
  ];
  return diagnostics.length > 0 || vendor === undefined || !vendor.ok || target === undefined
    ? failureOf(diagnostics, cliDiagnostic("cli.arguments.invalid", "Install arguments are invalid."))
    : andThen(bundleSource({ plugin, version, source: scan.options.get("--source") }, vendor.value, cwd), (source) => success({ source, target }));
}

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

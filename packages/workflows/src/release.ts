import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  compileVendorPayload,
  verifyVendorPayload,
  type CompileResult,
  type VendorAdapter,
  type VerificationResult,
} from "@agent-plugins/compiler";
import { loadPluginRoot, pluginDirectoryName, type Diagnostic } from "@agent-plugins/core";

import type { WorkflowAdapter } from "./adapter.js";
import { assemblePluginSource } from "./assemble.js";

/** Plugins released with committed host payloads, by directory name under `plugins/`. */
export const SHIPPED_PLUGINS = Object.freeze(["hello-world", "unified-plugin-framework"] as const);

/** What `use` returned for the assembled copy, or why the plugin could not be assembled. */
export type Staged<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly problems: readonly string[] };

/** Where the repository's plugins live and where one host adapter keeps its shipped payloads. */
export interface ReleaseLayout {
  readonly pluginsRoot: string;
  readonly payloadsRoot: string;
}

/** One shipped plugin's build or verification outcome. */
export interface PayloadReport {
  readonly plugin: string;
  readonly result: CompileResult | VerificationResult;
}

type PayloadStep = (source: string, shipped: string, adapter: VendorAdapter) => CompileResult | VerificationResult;

const PAYLOAD_STEPS: ReadonlyMap<string, PayloadStep> = new Map<string, PayloadStep>([
  ["build", (source, shipped, adapter) => compileVendorPayload({ source, vendor: adapter.vendor, output: shipped }, adapter)],
  ["verify", (source, shipped, adapter) => verifyVendorPayload({ source, vendor: adapter.vendor, shipped }, adapter)],
]);

const failed = (code: string, messages: readonly string[], path: string): CompileResult => ({
  ok: false,
  diagnostics: messages.map((message): Diagnostic => ({ severity: "error", code, message, path })),
});

// Effect boundary: stages an assembled copy in a temporary directory and always removes it.
/**
 * Assembles the plugin at `sourceRoot` into a temporary directory, hands that directory to `use`, then removes it.
 * Nothing assembled outlives the call, so the plugin source stays the only thing committed besides shipped payloads.
 */
export const withAssembledSource = <A>(
  sourceRoot: string,
  adapters: readonly WorkflowAdapter<string>[],
  use: (assembledRoot: string) => A,
): Staged<A> => {
  const scratch = mkdtempSync(join(tmpdir(), "upf-assembled-"));
  try {
    const staged = join(scratch, basename(sourceRoot));
    const assembled = assemblePluginSource(sourceRoot, staged, adapters);
    return assembled.ok ? { ok: true, value: use(staged) } : assembled;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

/**
 * Install finds a payload by the unscoped part of the plugin's manifest name, so a shipped plugin's directory must be
 * named after it. An unreadable manifest passes here and is left to the compiler to report.
 */
const nameMismatch = (plugin: string, root: string): CompileResult | undefined => {
  const name = loadPluginRoot(root).manifest?.name;
  const expected = name === undefined ? plugin : pluginDirectoryName(name);
  return expected === plugin
    ? undefined
    : failed(
        "release.plugin.name_mismatch",
        [`Rename plugins/${plugin} to plugins/${expected}: install looks payloads up by the manifest name ${name ?? ""}.`],
        plugin,
      );
};

/** One shipped plugin: its name, its source directory, and where its payload is shipped. */
interface ShippedPlugin {
  readonly plugin: string;
  readonly root: string;
  readonly shipped: string;
}

const releaseStaged =
  (step: PayloadStep, adapter: VendorAdapter, adapters: readonly WorkflowAdapter<string>[]) =>
  ({ plugin, root, shipped }: ShippedPlugin): CompileResult | VerificationResult => {
    const staged = withAssembledSource(root, adapters, (source) => step(source, shipped, adapter));
    return staged.ok ? staged.value : failed("release.assembly.failed", staged.problems, plugin);
  };

const releaseOne =
  (step: PayloadStep, adapter: VendorAdapter, layout: ReleaseLayout, adapters: readonly WorkflowAdapter<string>[]) =>
  (plugin: string): PayloadReport => {
    const root = join(layout.pluginsRoot, plugin);
    return {
      plugin,
      result:
        nameMismatch(plugin, root) ??
        releaseStaged(step, adapter, adapters)({ plugin, root, shipped: join(layout.payloadsRoot, plugin) }),
    };
  };

/** Builds (`build`) or checks (`verify`) one host's payload for every shipped plugin, each from its assembled source. */
export const releasePayloads = (
  operation: string,
  adapter: VendorAdapter,
  layout: ReleaseLayout,
  adapters: readonly WorkflowAdapter<string>[],
): readonly PayloadReport[] => {
  const step = PAYLOAD_STEPS.get(operation);
  return step === undefined
    ? [{ plugin: "*", result: failed("release.operation.unknown", ["Expected build or verify."], operation) }]
    : SHIPPED_PLUGINS.map(releaseOne(step, adapter, layout, adapters));
};

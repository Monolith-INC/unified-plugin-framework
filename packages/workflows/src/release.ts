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

/** Install finds a payload by the plugin's manifest name, so a shipped plugin's directory must carry that name. */
const nameMismatch = (plugin: string, root: string): string | undefined => {
  const name = loadPluginRoot(root).manifest?.name;
  return name === undefined || pluginDirectoryName(name) === plugin
    ? undefined
    : `Plugin directory ${plugin} must be named after its manifest name ${name}: install looks payloads up by manifest name.`;
};

const releaseStaged = (
  step: PayloadStep,
  adapter: VendorAdapter,
  adapters: readonly WorkflowAdapter<string>[],
  root: string,
  shipped: string,
): CompileResult | VerificationResult => {
  const staged = withAssembledSource(root, adapters, (source) => step(source, shipped, adapter));
  return staged.ok ? staged.value : failed("release.assembly.failed", staged.problems, root);
};

const releaseOne =
  (step: PayloadStep, adapter: VendorAdapter, layout: ReleaseLayout, adapters: readonly WorkflowAdapter<string>[]) =>
  (plugin: string): PayloadReport => {
    const root = join(layout.pluginsRoot, plugin);
    const mismatch = nameMismatch(plugin, root);
    return {
      plugin,
      result:
        mismatch === undefined
          ? releaseStaged(step, adapter, adapters, root, join(layout.payloadsRoot, plugin))
          : failed("release.plugin.name_mismatch", [mismatch], plugin),
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

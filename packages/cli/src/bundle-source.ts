import { claudeAdapter } from "@agent-plugins/adapter-claude";
import { codexAdapter } from "@agent-plugins/adapter-codex";
import { cursorAdapter } from "@agent-plugins/adapter-cursor";
import { failure, success, type Result, type VendorAdapter, type VendorBundle, type VendorId } from "@agent-plugins/compiler";
import { andThen, andThenAsync } from "@agent-plugins/compiler/railway";
import { buildVendorBundle } from "@agent-plugins/workflows";

import { downloadReleaseBundle, type FetchBytes, type ReleaseRequest } from "./release-download.js";

/** Where an install takes its payload from: a GitHub release, or a plugin source directory built on the spot. */
export type BundleSource =
  | ({ readonly kind: "release" } & ReleaseRequest)
  | { readonly kind: "source"; readonly root: string; readonly vendor: VendorId };

/** A bundle ready to install, with the host adapter that plans its installation. */
export interface ResolvedPayload {
  readonly bundle: VendorBundle;
  readonly adapter: VendorAdapter;
}

export type ResolvedBundle = Result<ResolvedPayload>;

/** The adapter this CLI installs with, per host. */
export const HOST_ADAPTERS: Readonly<Record<VendorId, VendorAdapter>> = Object.freeze({
  claude: claudeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
});

const withAdapter =
  (vendor: VendorId) =>
  (bundle: VendorBundle): ResolvedBundle =>
    success({ bundle, adapter: HOST_ADAPTERS[vendor] });

/** A release built by another adapter version than this CLI's cannot be installed; say which side to move. */
const matchingAdapter =
  (vendor: VendorId) =>
  (bundle: VendorBundle): ResolvedBundle => {
    const built = bundle.manifest.adapter;
    const adapter = HOST_ADAPTERS[vendor];
    return built.version === adapter.adapterVersion && built.vendorSchemaVersion === adapter.vendorSchemaVersion
      ? success({ bundle, adapter })
      : failure({
          severity: "error",
          code: "cli.release.adapter_mismatch",
          message: `This release was built with the ${vendor} adapter ${built.version} (${built.vendorSchemaVersion}); this CLI has ${adapter.adapterVersion} (${adapter.vendorSchemaVersion}). Install a release made for this CLI, or upgrade the CLI.`,
        });
  };

/** Builds one host's bundle from a plugin source directory, exactly as the release build does, for development installs. */
export const resolveSourceBundle = (root: string, vendor: VendorId): ResolvedBundle =>
  andThen(buildVendorBundle(root, HOST_ADAPTERS[vendor]), withAdapter(vendor));

/** Downloads and verifies one released bundle, then pairs it with this CLI's adapter for its host. */
export const releaseResolver =
  (fetchBytes: FetchBytes, base: string) =>
  (request: ReleaseRequest): Promise<ResolvedBundle> =>
    andThenAsync(downloadReleaseBundle(fetchBytes, base)(request), matchingAdapter(request.vendor));

/** Resolves either kind of install source to a bundle and its adapter. */
export const bundleResolver =
  (fetchBytes: FetchBytes, base: string) =>
  (source: BundleSource): Promise<ResolvedBundle> => {
    switch (source.kind) {
      case "release":
        return releaseResolver(fetchBytes, base)(source);
      case "source":
        return Promise.resolve(resolveSourceBundle(source.root, source.vendor));
    }
  };

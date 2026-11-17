import { failure, success, type Result, type VendorBundle, type VendorId } from "@agent-plugins/compiler";
import { andThen, andThenAsync } from "@agent-plugins/compiler/railway";
import { pluginDirectoryName } from "@agent-plugins/core";

import { CHECKSUMS_ASSET, parseChecksums, releaseAssetName, releaseTag, unpackReleaseAsset } from "./release-asset.js";

/** Reads one URL's bytes. Injected, so release installs are testable without a network. */
export type FetchBytes = (url: string) => Promise<Result<Uint8Array>>;

/** One released plugin payload: which plugin, which release, which host. */
export interface ReleaseRequest {
  readonly plugin: string;
  readonly version: string;
  readonly vendor: VendorId;
}

/** Where GitHub serves this repository's release assets, one directory per tag. */
export const DEFAULT_RELEASE_URL = "https://github.com/Monolith-INC/unified-plugin-framework/releases/download";

/** A stalled server fails the install instead of hanging it. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

const releaseFailure = (code: string, message: string, path?: string): Result<never> =>
  failure({ severity: "error", code, message, ...(path === undefined ? {} : { path }) });

const downloadFailure = (url: string, reason: string): Result<never> =>
  releaseFailure("cli.release.download", `Could not download ${url} (${reason}). Check the version and your connection, then install again.`, url);

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : "network unavailable");

const responseBytes = (url: string, response: Response): Promise<Result<Uint8Array>> =>
  response.ok
    ? response.arrayBuffer().then(
        (buffer) => success(new Uint8Array(buffer)),
        (error: unknown) => downloadFailure(url, reasonOf(error)),
      )
    : Promise.resolve(downloadFailure(url, `HTTP ${response.status}`));

// Edge: the install path's only network read, an HTTPS GET of one release asset, bounded by a timeout.
export const nodeFetchBytes: FetchBytes = (url) =>
  fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }).then( // fp-allow: no-ambient-effect
    (response) => responseBytes(url, response),
    (error: unknown) => downloadFailure(url, reasonOf(error)),
  );

// Edge: a mirror or fork may serve the same assets from another base URL.
/** The release base URL, overridable with `AGENT_PLUGIN_RELEASE_URL`. */
export const releaseBaseUrl = (): string => process.env["AGENT_PLUGIN_RELEASE_URL"] ?? DEFAULT_RELEASE_URL; // fp-allow: no-ambient-effect

/** Assets are only ever fetched over HTTPS, whichever base URL is configured. */
const secureBase = (base: string): Result<string> =>
  base.startsWith("https://")
    ? success(base.replace(/\/+$/u, ""))
    : releaseFailure("cli.release.insecure", `Release URL ${base} is not HTTPS; set AGENT_PLUGIN_RELEASE_URL to an https:// address.`);

const assetUrl = (root: string, version: string, name: string): string =>
  `${root}/${encodeURIComponent(releaseTag(version))}/${encodeURIComponent(name)}`;

const publishedDigest = (sums: Uint8Array, name: string, version: string): Result<string> => {
  const digest = parseChecksums(Buffer.from(sums).toString("utf8")).get(name);
  return digest === undefined
    ? releaseFailure("cli.release.asset_missing", `Release ${releaseTag(version)} publishes no ${name}; that plugin or host is not in this release.`, name)
    : success(digest);
};

/** Refuses an asset that is genuine but holds a different plugin or host than the one asked for. */
const matchingRequest =
  ({ plugin, vendor }: ReleaseRequest) =>
  (bundle: VendorBundle): Result<VendorBundle> =>
    pluginDirectoryName(bundle.manifest.plugin.name) === pluginDirectoryName(plugin) && bundle.manifest.vendor === vendor
      ? success(bundle)
      : releaseFailure("cli.release.identity", `The downloaded asset holds ${bundle.manifest.plugin.name} for ${bundle.manifest.vendor}, not ${plugin} for ${vendor}.`);

/** The release's `SHA256SUMS`, then the digest it publishes for `name`. */
const fetchDigest = (fetchBytes: FetchBytes, root: string, request: ReleaseRequest, name: string): Promise<Result<string>> =>
  andThenAsync(fetchBytes(assetUrl(root, request.version, CHECKSUMS_ASSET)), (sums) => publishedDigest(sums, name, request.version));

/** The asset itself, accepted only under its published digest and only for the requested plugin and host. */
const fetchVerified =
  (fetchBytes: FetchBytes, root: string, request: ReleaseRequest, name: string) =>
  (digest: string): Promise<Result<VendorBundle>> =>
    andThenAsync(fetchBytes(assetUrl(root, request.version, name)), (bytes) => andThen(unpackReleaseAsset(bytes, digest), matchingRequest(request)));

/**
 * Downloads one plugin's payload for one host from a GitHub release: the release's `SHA256SUMS` first, then the asset,
 * which must match its published digest and every digest inside it before anything is installed. This proves the
 * asset is intact and is the one the release lists; the release's build provenance attestation proves who built it.
 */
export const downloadReleaseBundle =
  (fetchBytes: FetchBytes, base: string) =>
  (request: ReleaseRequest): Promise<Result<VendorBundle>> => {
    const name = releaseAssetName(request.plugin, request.vendor);
    return andThenAsync(Promise.resolve(secureBase(base)), (root) =>
      andThenAsync(fetchDigest(fetchBytes, root, request, name), fetchVerified(fetchBytes, root, request, name)),
    );
  };

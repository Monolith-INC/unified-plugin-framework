import type { Result, VendorBundle, VendorId } from "@agent-plugins/compiler";
import { pluginDirectoryName } from "@agent-plugins/core";
import { CHECKSUMS_ASSET, parseChecksums, releaseAssetName, releaseTag, unpackReleaseAsset } from "@agent-plugins/workflows";

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

const releaseFailure = (code: string, message: string, path?: string): Result<never> => ({
  ok: false,
  diagnostics: [{ severity: "error", code, message, ...(path === undefined ? {} : { path }) }],
});

const downloadFailure = (url: string, reason: string): Result<never> =>
  releaseFailure("cli.release.download", `Could not download ${url} (${reason}). Check the version and your connection, then install again.`, url);

const responseBytes = (url: string, response: Response): Promise<Result<Uint8Array>> =>
  response.ok
    ? response.arrayBuffer().then((buffer): Result<Uint8Array> => ({ ok: true, value: new Uint8Array(buffer) }))
    : Promise.resolve(downloadFailure(url, `HTTP ${response.status}`));

// Edge: the install path's only network read, an HTTPS GET of one release asset.
export const nodeFetchBytes: FetchBytes = (url) =>
  fetch(url).then( // fp-allow: no-ambient-effect
    (response) => responseBytes(url, response),
    () => downloadFailure(url, "network unavailable"),
  );

// Edge: a mirror or fork may serve the same assets from another base URL.
/** The release base URL, overridable with `AGENT_PLUGIN_RELEASE_URL`. */
export const releaseBaseUrl = (): string => process.env["AGENT_PLUGIN_RELEASE_URL"] ?? DEFAULT_RELEASE_URL; // fp-allow: no-ambient-effect

const assetUrl = (base: string, version: string, name: string): string =>
  `${base.replace(/\/+$/u, "")}/${encodeURIComponent(releaseTag(version))}/${encodeURIComponent(name)}`;

const publishedDigest = (sums: Uint8Array, name: string, version: string): Result<string> => {
  const digest = parseChecksums(Buffer.from(sums).toString("utf8")).get(name);
  return digest === undefined
    ? releaseFailure("cli.release.asset_missing", `Release ${releaseTag(version)} publishes no ${name}; that plugin or host is not in this release.`, name)
    : { ok: true, value: digest };
};

/** Refuses an asset that is genuine but holds a different plugin or host than the one asked for. */
const matchingRequest = ({ plugin, vendor }: ReleaseRequest, bundle: VendorBundle): Result<VendorBundle> =>
  pluginDirectoryName(bundle.manifest.plugin.name) === pluginDirectoryName(plugin) && bundle.manifest.vendor === vendor
    ? { ok: true, value: bundle }
    : releaseFailure("cli.release.identity", `The downloaded asset holds ${bundle.manifest.plugin.name} for ${bundle.manifest.vendor}, not ${plugin} for ${vendor}.`);

const fetchAsset =
  (fetchBytes: FetchBytes, base: string, request: ReleaseRequest, name: string) =>
  (digest: string): Promise<Result<VendorBundle>> =>
    fetchBytes(assetUrl(base, request.version, name)).then((asset) => {
      const unpacked = asset.ok ? unpackReleaseAsset(asset.value, digest) : asset;
      return unpacked.ok ? matchingRequest(request, unpacked.value) : unpacked;
    });

/**
 * Downloads one plugin's payload for one host from a GitHub release: the release's `SHA256SUMS` first, then the asset,
 * which must match its published digest and every digest inside it before anything is installed.
 */
export const downloadReleaseBundle =
  (fetchBytes: FetchBytes, base: string) =>
  (request: ReleaseRequest): Promise<Result<VendorBundle>> => {
    const name = releaseAssetName(request.plugin, request.vendor);
    return fetchBytes(assetUrl(base, request.version, CHECKSUMS_ASSET)).then((sums) => {
      const digest = sums.ok ? publishedDigest(sums.value, name, request.version) : sums;
      return digest.ok ? fetchAsset(fetchBytes, base, request, name)(digest.value) : digest;
    });
  };

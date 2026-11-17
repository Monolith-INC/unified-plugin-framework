import { gunzipSync, gzipSync } from "node:zlib";

import {
  parseVendorBundleManifest,
  sha256,
  validateVendorBundle,
  type PayloadFile,
  type PayloadFileDescriptor,
  type Result,
  type VendorBundle,
  type VendorBundleManifest,
  type VendorId,
} from "@agent-plugins/compiler";
import { pluginDirectoryName, type Diagnostic } from "@agent-plugins/core";

/** Identifies the archive layout, so a later layout can be told apart from this one. */
export const RELEASE_ASSET_FORMAT = "upf-vendor-bundle/1" as const;

/** The release file listing every asset's SHA-256, in `sha256sum` format. */
export const CHECKSUMS_ASSET = "SHA256SUMS" as const;

/** One file attached to a GitHub release. */
export interface ReleaseAsset {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** The asset holding one plugin's payload for one host, named by the plugin's directory name. */
export const releaseAssetName = (plugin: string, vendor: VendorId): string => `${pluginDirectoryName(plugin)}-${vendor}.bundle.json.gz`;

/** The release tag for a version: `0.2.0` and `v0.2.0` both name `v0.2.0`. */
export const releaseTag = (version: string): string => (version.startsWith("v") ? version : `v${version}`);

const base64 = (content: Uint8Array): string => Buffer.from(content).toString("base64");

/** Packs a built bundle into one gzipped JSON archive: its manifest plus every payload file's bytes. Pure. */
export const packReleaseAsset = (bundle: VendorBundle): ReleaseAsset => ({
  name: releaseAssetName(bundle.manifest.plugin.name, bundle.manifest.vendor),
  bytes: gzipSync(
    JSON.stringify({
      format: RELEASE_ASSET_FORMAT,
      manifest: bundle.manifest,
      contents: Object.fromEntries(bundle.files.map((file) => [file.path, base64(file.content)])),
    }),
  ),
});

/** The checksums file for a release's assets, one `<sha256>  <name>` line each, in the order given. */
export const renderChecksums = (assets: readonly ReleaseAsset[]): string =>
  assets.map((asset) => `${sha256(asset.bytes)}  ${asset.name}\n`).join("");

const CHECKSUM_LINE = /^(?<digest>[0-9a-f]{64}) [ *](?<name>\S+)$/u;

const checksumEntry = (line: string): readonly (readonly [string, string])[] => {
  const groups = CHECKSUM_LINE.exec(line)?.groups;
  const name = groups?.["name"];
  const digest = groups?.["digest"];
  return name === undefined || digest === undefined ? [] : [[name, digest]];
};

/** Reads a `sha256sum` listing into asset name → digest; lines in any other shape are ignored. */
export const parseChecksums = (text: string): ReadonlyMap<string, string> => new Map(text.split(/\r?\n/u).flatMap(checksumEntry));

const assetFailure = (code: string, message: string): Result<never> => ({
  ok: false,
  diagnostics: [{ severity: "error", code, message }],
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Boundary: gunzip and JSON.parse throw on malformed bytes; that failure is returned as `undefined` and reported by the caller.
const readArchive = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
};

const decodeContent = (raw: unknown): Uint8Array => new Uint8Array(typeof raw === "string" ? Buffer.from(raw, "base64") : []);

/** A payload file as the archive holds it; its digest and size are recomputed, so validation catches any tampering. */
const payloadFile =
  (contents: Readonly<Record<string, unknown>>) =>
  (descriptor: PayloadFileDescriptor): PayloadFile => {
    const content = decodeContent(contents[descriptor.path]);
    return { path: descriptor.path, mode: descriptor.mode, content, sha256: sha256(content), bytes: content.byteLength };
  };

const validated = (bundle: VendorBundle): Result<VendorBundle> => {
  const [first, ...rest]: readonly Diagnostic[] = validateVendorBundle(bundle);
  return first === undefined ? { ok: true, value: bundle } : { ok: false, diagnostics: [first, ...rest] };
};

const bundleFrom = (manifest: Result<VendorBundleManifest>, contents: Readonly<Record<string, unknown>>): Result<VendorBundle> =>
  !manifest.ok
    ? manifest
    : Object.keys(contents).length !== manifest.value.files.length
      ? assetFailure("release.asset.contents", "Release asset holds files its manifest does not list.")
      : validated({ manifest: manifest.value, files: manifest.value.files.map(payloadFile(contents)) });

const decodeArchive = (archive: unknown): Result<VendorBundle> => {
  const fields: Readonly<Record<string, unknown>> = isRecord(archive) && archive["format"] === RELEASE_ASSET_FORMAT ? archive : {};
  const contents = fields["contents"];
  return isRecord(contents)
    ? bundleFrom(parseVendorBundleManifest(fields["manifest"]), contents)
    : assetFailure("release.asset.unreadable", `Release asset is not a ${RELEASE_ASSET_FORMAT} archive.`);
};

/**
 * Turns downloaded asset bytes back into a validated bundle. The bytes must match the published digest first;
 * every file digest and the payload digest are then checked by the compiler's own bundle validation. Pure.
 */
export const unpackReleaseAsset = (bytes: Uint8Array, expectedDigest: string): Result<VendorBundle> =>
  sha256(bytes) === expectedDigest
    ? decodeArchive(readArchive(bytes))
    : assetFailure("release.asset.digest_mismatch", "Release asset does not match its published SHA-256; it was not installed.");

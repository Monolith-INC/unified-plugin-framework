import { gunzipSync, gzipSync } from "node:zlib";

import {
  createPayloadFile,
  failure,
  parseVendorBundleManifest,
  sha256,
  success,
  validateVendorBundle,
  type PayloadFile,
  type PayloadFileDescriptor,
  type Result,
  type VendorBundle,
  type VendorBundleManifest,
  type VendorId,
} from "@agent-plugins/compiler";
import { andThen, fromDiagnostics, isRecord, sequenceResults } from "@agent-plugins/compiler/railway";
import { pluginDirectoryName } from "@agent-plugins/core";

/** Identifies the archive layout, so a later layout can be told apart from this one. */
export const RELEASE_ASSET_FORMAT = "upf-vendor-bundle/1" as const;

/** The release file listing every asset's SHA-256, in `sha256sum` format. */
export const CHECKSUMS_ASSET = "SHA256SUMS" as const;

/** A release version: `0.2.0`, `v0.2.0` or `v0.2.0-rc.1`. The release workflow accepts tags of the same shape. */
export const RELEASE_VERSION = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

/** One file attached to a GitHub release. */
export interface ReleaseAsset {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Everything a release publishes: one asset per plugin per host, and the checksums of all of them. */
export interface ReleaseSet {
  readonly assets: readonly ReleaseAsset[];
  readonly checksums: string;
}

/** The asset holding one plugin's payload for one host, named by the plugin's directory name. */
export const releaseAssetName = (plugin: string, vendor: VendorId): string => `${pluginDirectoryName(plugin)}-${vendor}.bundle.json.gz`;

/** The release tag for a version: `0.2.0` and `v0.2.0` both name `v0.2.0`. */
export const releaseTag = (version: string): string => (version.startsWith("v") ? version : `v${version}`);

const assetFailure = (code: string, message: string): Result<never> => failure({ severity: "error", code, message });

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

// Boundary: gunzip and JSON.parse throw on malformed bytes; that failure is returned as `undefined` and reported by the caller.
const readArchive = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
};

interface ArchiveFields {
  readonly manifest: unknown;
  readonly contents: Readonly<Record<string, unknown>>;
}

const archiveFields = (archive: unknown): Result<ArchiveFields> => {
  const contents = isRecord(archive) && archive["format"] === RELEASE_ASSET_FORMAT ? archive["contents"] : undefined;
  return isRecord(archive) && isRecord(contents)
    ? success({ manifest: archive["manifest"], contents })
    : assetFailure("release.asset.unreadable", `Release asset is not a ${RELEASE_ASSET_FORMAT} archive.`);
};

/** The archive's files as path → bytes, accepted only when every entry is base64 text. */
const contentEntries = ({ contents }: ArchiveFields): Result<ReadonlyMap<string, Uint8Array>> =>
  Object.values(contents).every((raw) => typeof raw === "string")
    ? success(new Map(Object.entries(contents).map(([path, raw]) => [path, new Uint8Array(Buffer.from(String(raw), "base64"))])))
    : assetFailure("release.asset.contents", "Release asset holds a file whose content is not base64 text.");

/** The manifest must list exactly the archive's files: none missing, none extra. */
const listsExactly = (manifest: VendorBundleManifest, contents: ReadonlyMap<string, Uint8Array>): boolean =>
  manifest.files.length === contents.size && manifest.files.every((file) => contents.has(file.path));

/** A payload file as the archive holds it; its digest and size are recomputed, so validation catches any tampering. */
const payloadFile =
  (contents: ReadonlyMap<string, Uint8Array>) =>
  (descriptor: PayloadFileDescriptor): Result<PayloadFile> =>
    createPayloadFile({ path: descriptor.path, content: contents.get(descriptor.path) ?? new Uint8Array(), mode: descriptor.mode });

const validBundle = (bundle: VendorBundle): Result<VendorBundle> => fromDiagnostics(validateVendorBundle(bundle), bundle);

const bundleFrom =
  (contents: ReadonlyMap<string, Uint8Array>) =>
  (manifest: VendorBundleManifest): Result<VendorBundle> =>
    listsExactly(manifest, contents)
      ? andThen(sequenceResults(manifest.files.map(payloadFile(contents))), (files) => validBundle({ manifest, files }))
      : assetFailure("release.asset.contents", "Release asset files do not match the files its manifest lists.");

const decodeArchive = (archive: unknown): Result<VendorBundle> =>
  andThen(archiveFields(archive), (fields) =>
    andThen(contentEntries(fields), (contents) => andThen(parseVendorBundleManifest(fields.manifest), bundleFrom(contents))),
  );

/**
 * Turns downloaded asset bytes back into a validated bundle. The bytes must match the published digest first;
 * every file digest and the payload digest are then checked by the compiler's own bundle validation. Pure.
 */
export const unpackReleaseAsset = (bytes: Uint8Array, expectedDigest: string): Result<VendorBundle> =>
  sha256(bytes) === expectedDigest
    ? decodeArchive(readArchive(bytes))
    : assetFailure("release.asset.digest_mismatch", "Release asset does not match its published SHA-256; it was not installed.");

interface Packed {
  readonly bundle: VendorBundle;
  readonly asset: ReleaseAsset;
}

/** Unpacks one asset under its published digest and requires the payload it was packed from. */
const roundTrip =
  (digests: ReadonlyMap<string, string>) =>
  ({ bundle, asset }: Packed): Result<VendorBundle> =>
    andThen(unpackReleaseAsset(asset.bytes, digests.get(asset.name) ?? ""), (unpacked) =>
      unpacked.manifest.payloadDigest === bundle.manifest.payloadDigest
        ? success(unpacked)
        : assetFailure("release.asset.round_trip", `${asset.name} does not unpack to the payload it was packed from.`),
    );

const releaseSetOf = (packed: readonly Packed[]): Result<ReleaseSet> => {
  const assets = packed.map(({ asset }) => asset);
  const checksums = renderChecksums(assets);
  return andThen(sequenceResults(packed.map(roundTrip(parseChecksums(checksums)))), () => success({ assets, checksums }));
};

/** Packs every built bundle and proves each archive unpacks, under its published digest, to its own payload. Pure. */
export const packReleaseSet = (built: readonly Result<VendorBundle>[]): Result<ReleaseSet> =>
  andThen(sequenceResults(built), (bundles) => releaseSetOf(bundles.map((bundle) => ({ bundle, asset: packReleaseAsset(bundle) }))));

// Release edge: packs the generated host payloads (`pnpm payloads:build`) into one archive per plugin per host,
// writes SHA256SUMS beside them, and proves every archive unpacks to the bundle it was packed from.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { VENDOR_IDS, readVendorBundle } from "@agent-plugins/compiler";
import { CHECKSUMS_ASSET, SHIPPED_PLUGINS, packReleaseAsset, parseChecksums, renderChecksums, unpackReleaseAsset } from "@agent-plugins/workflows";

const repository = resolve(import.meta.dirname, "../../..");
const output = resolve(process.argv[2] ?? join(repository, "release-assets"));

const loaded = VENDOR_IDS.flatMap((vendor) =>
  SHIPPED_PLUGINS.map((plugin) => ({ vendor, plugin, bundle: readVendorBundle(join(repository, "packages", `adapter-${vendor}`, "payloads", plugin)) })),
);
const unreadable = loaded.filter(({ bundle }) => !bundle.ok);
const assets = unreadable.length === 0 ? loaded.map(({ bundle }) => packReleaseAsset(bundle.value)) : [];
const checksums = renderChecksums(assets);
const digests = parseChecksums(checksums);
const roundTrips = loaded.flatMap(({ bundle }, index) => {
  const asset = assets[index];
  const unpacked = asset === undefined ? undefined : unpackReleaseAsset(asset.bytes, digests.get(asset.name) ?? "");
  return unpacked?.ok === true && unpacked.value.manifest.payloadDigest === bundle.value.manifest.payloadDigest ? [] : [asset?.name ?? "?"];
});

const report = { output, assets: assets.map(({ name }) => name), unreadable, roundTripFailures: unreadable.length === 0 ? roundTrips : [] };
const ok = unreadable.length === 0 && roundTrips.length === 0;
if (ok) {
  mkdirSync(output, { recursive: true });
  assets.map(({ name, bytes }) => writeFileSync(join(output, name), bytes));
  writeFileSync(join(output, CHECKSUMS_ASSET), checksums);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = ok ? 0 : 1;

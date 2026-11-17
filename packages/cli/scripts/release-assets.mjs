// Release edge: builds every shipped plugin for every host from source, packs one archive per plugin per host,
// proves each archive round-trips, then writes the archives and SHA256SUMS. All logic is in packReleaseSet.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { SHIPPED_PLUGINS, buildVendorBundle } from "@agent-plugins/workflows";

import { HOST_ADAPTERS } from "../dist/bundle-source.js";
import { CHECKSUMS_ASSET, packReleaseSet } from "../dist/release-asset.js";

const repository = resolve(import.meta.dirname, "../../..");
const output = resolve(process.argv[2] ?? join(repository, "release-assets"));

const set = packReleaseSet(
  Object.values(HOST_ADAPTERS).flatMap((adapter) =>
    SHIPPED_PLUGINS.map((plugin) => buildVendorBundle(join(repository, "plugins", plugin), adapter)),
  ),
);

// Effect: write the release files only when every bundle built and every archive round-tripped.
const writeRelease = ({ assets, checksums }) => {
  mkdirSync(output, { recursive: true });
  [...assets, { name: CHECKSUMS_ASSET, bytes: checksums }].map(({ name, bytes }) => writeFileSync(join(output, name), bytes));
  return assets.map(({ name }) => name);
};

const report = set.ok ? { ok: true, output, assets: writeRelease(set.value) } : { ok: false, diagnostics: set.diagnostics };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = set.ok ? 0 : 1;

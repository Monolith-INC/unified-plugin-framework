# Vendor Payload Installation

Every plugin listed in `SHIPPED_PLUGINS` (`packages/workflows/src/release.ts`) is released with a verified payload for each host: `hello-world`, `unified-plugin-framework` and `project-knowledge`. The repository keeps one copy of each plugin, its canonical source. Host payloads are generated: CI builds them from the tagged source and attaches them to the GitHub release. They are never committed.

```text
canonical source (the only copy in git)
  plugins/<plugin>/plugin.json
  plugins/<plugin>/skills/<skill>/SKILL.md   (contract skills are templates)
        |
        v  tag v<version> pushed  ->  .github/workflows/release.yml
release-time assembly into a temporary copy (templates filled from their workflow adapters; other skills unchanged)
        |
        v
compiler contracts and deterministic bundle finalization, once per host (pnpm payloads:verify)
        |
        v
release assets (pnpm release:assets)
  <plugin>-claude.bundle.json.gz
  <plugin>-cursor.bundle.json.gz
  <plugin>-codex.bundle.json.gz
  SHA256SUMS
        |
        v
agent-plugin install <plugin> --version <version> --vendor <host> --target <dir>
  downloads SHA256SUMS and the asset, checks the asset digest, then every file and payload digest inside it
        |
        v
transactional installer
```

## Installation

Install a released plugin for one host by naming the plugin, the release version and the host. Use the version of a published [release](https://github.com/Monolith-INC/unified-plugin-framework/releases) that lists `SHA256SUMS` among its assets; releases made before this workflow existed (up to `v0.2.0-rc.1`) have none:

```sh
agent-plugin install unified-plugin-framework --version <version> --vendor claude --target <target-directory>
agent-plugin install unified-plugin-framework --version <version> --vendor cursor --target <target-directory>
agent-plugin install unified-plugin-framework --version <version> --vendor codex --target <target-directory>
agent-plugin install project-knowledge --version <version> --vendor claude --target <target-directory>
agent-plugin install project-knowledge --version <version> --vendor cursor --target <target-directory>
agent-plugin install project-knowledge --version <version> --vendor codex --target <target-directory>
agent-plugin install hello-world --version <version> --vendor claude --target <target-directory>
agent-plugin install hello-world --version <version> --vendor cursor --target <target-directory>
agent-plugin install hello-world --version <version> --vendor codex --target <target-directory>
```

The command downloads the release's `SHA256SUMS`, then `<plugin>-<host>.bundle.json.gz`. Before anything is written it checks:

- the asset's SHA-256 against `SHA256SUMS` (`release.asset.digest_mismatch`);
- every payload file's digest, size and mode, and the payload digest, with the compiler's own bundle validation;
- that the asset holds the requested plugin for the requested host (`cli.release.identity`).

A release without the asset fails with `cli.release.asset_missing`; an unreachable release, a version that does not exist, a download cut off part-way or one that stalls for a minute fails with `cli.release.download`. A release built by a different adapter version than this CLI's fails with `cli.release.adapter_mismatch`; install a release made for your CLI, or upgrade the CLI. Leaving out `--version` when naming a plugin fails with `cli.arguments.mode` and says which flag to add.

Assets are downloaded over HTTPS from `https://github.com/Monolith-INC/unified-plugin-framework/releases/download/v<version>/`; set `AGENT_PLUGIN_RELEASE_URL` to an `https://` mirror that serves the same files.

### What the checks prove

The digest checks prove the asset is intact and is the one the release's `SHA256SUMS` lists. They do not prove who published it: `SHA256SUMS` comes from the same release, so anyone able to replace the release's files could replace both. To check origin, verify the build provenance attestation the release workflow records for every asset; it shows the asset was built by this repository's release workflow from the tagged commit:

```sh
gh attestation verify <plugin>-<host>.bundle.json.gz --repo Monolith-INC/unified-plugin-framework
```

Successful output is a stable JSON envelope:

```json
{
  "ok": true,
  "outcome": "installed",
  "plugin": "hello-world",
  "version": "1.0.0",
  "vendor": "claude",
  "adapterVersion": "1.0.0",
  "payloadDigest": "<payload digest from bundle.json>",
  "target": "<target-directory>",
  "changedPaths": 2
}
```

Re-running the same command returns `outcome: "unchanged"` when the installed record and managed files still match the bundle.

### Installing from a source checkout

For development, pass the plugin's source directory with `--source` instead of a plugin name and version. The command builds the host payload from that directory the same way the release build does, then installs it; nothing generated is kept. Build the workspace first so the CLI runs the current compiled output; `pnpm agent-plugin` runs it from the repository root:

```sh
pnpm build
pnpm agent-plugin install --source plugins/unified-plugin-framework --vendor claude --target <target-directory>
pnpm agent-plugin install --source plugins/unified-plugin-framework --vendor cursor --target <target-directory>
pnpm agent-plugin install --source plugins/unified-plugin-framework --vendor codex --target <target-directory>
pnpm agent-plugin install --source plugins/hello-world --vendor claude --target <target-directory>
pnpm agent-plugin install --source plugins/hello-world --vendor cursor --target <target-directory>
pnpm agent-plugin install --source plugins/hello-world --vendor codex --target <target-directory>
pnpm agent-plugin install --source plugins/project-knowledge --vendor claude --target <target-directory>
pnpm agent-plugin install --source plugins/project-knowledge --vendor cursor --target <target-directory>
pnpm agent-plugin install --source plugins/project-knowledge --vendor codex --target <target-directory>
```

A source install reflects the checkout as it is, including uncommitted edits, so it is the way to try a skill change on a host before it is released.

## Releasing

Push a tag named `v<version>` on a commit of `main`. The release workflow (`.github/workflows/release.yml`) refuses a tag that is not shaped like `v0.2.0` or `v0.2.0-rc.1` or is not on `main`, runs the full CI suite on it, then builds every shipped plugin for every host with `pnpm release:assets`, records a build provenance attestation for each asset, and creates the GitHub release with every asset attached. A tag with a suffix, such as `v0.2.0-rc.2`, publishes a pre-release. To publish an existing tag again (for example after a failed run), run the workflow by hand with that tag; it replaces the release's assets. When GitHub's macOS runners are unavailable, also tick `skip_macos`, which runs the checks on Ubuntu and Windows only (`gh workflow run release.yml -f tag=<tag> -f skip_macos=true`). A tag must contain the workflow to be published, so tags up to `v0.2.0-rc.1` cannot be.

`pnpm payloads:verify` generates every shipped plugin's payload for every host into the git-ignored `packages/adapter-*/payloads/`, then generates them again and compares, so a build that is not deterministic, or not valid for its host, fails. `pnpm release:assets` builds the same payloads from source, packs them into `release-assets/`, writes `SHA256SUMS`, and unpacks each archive again to prove it round-trips to the same payload digest. CI runs both on every pull request, so a release is never the first time a payload is built.

To release another plugin, add its directory name to `SHIPPED_PLUGINS`. The directory must be named after the unscoped part of the plugin's manifest name (`foo` for `@scope/foo`), because release assets are named after it; the build refuses a plugin whose names differ.

## Authoring Guide

Canonical plugin authors edit only the portable plugin source under `plugins/<plugin>/`. Contract skills of the framework plugin are templates; ADR-001 describes how they are assembled from workflow adapters.

Generated payload content is owned by the adapter packages. Each adapter's payload script (`packages/adapter-*/scripts/payload.mjs`) assembles every shipped plugin into a temporary copy, which is removed afterwards. The compiler normalizes that copy, computes the source digest, asks the selected adapter to render vendor files, and finalizes `bundle.json` with file bytes, modes, hashes, adapter identity, and payload digest. To look at what a host receives, run `pnpm payloads:build` and read `packages/adapter-<host>/payloads/<plugin>/`; the directory is git-ignored and rebuilt on every run.

## Adapter Guide

Each adapter owns all vendor-specific names, paths, manifest fields, schema evidence, validation, and install planning. The shared compiler and installer never special-case vendor file shapes.

Adapter conformance checklist:

- Export a frozen `VendorAdapter` with exact `vendor`, `adapterVersion`, `vendorSchemaVersion`, `compile`, `validate`, and `planInstallation` members.
- Keep schema evidence in `packages/adapter-*/schema/evidence.json`, and include `schema` in the package `files` list.
- Provide `payload:build` and `payload:verify` scripts that generate into the git-ignored `payloads/` directory.
- Pass the shared adapter conformance suite.
- Keep provenance in `bundle.json`; do not add toolkit provenance fields to closed vendor manifests.

## Rollback and Recovery

The installer creates `.agent-plugins/install.lock`, stages files on the same filesystem, writes a durable transaction journal, commits deterministic writes, verifies the installed record, and cleans up transaction metadata.

Failure outcomes:

- `failed-before-mutation`, exit `3`: download, digest, validation, collision, target, lock, or adapter mismatch failed before managed files changed.
- exit `70`: an unexpected platform failure; nothing was changed and the details are not printed.
- `rolled-back`, exit `4`: a mutation failed and the installer restored the previous managed state.
- `rollback-failed`, exit `5`: rollback could not finish; stderr includes `recoveryJournal` pointing at the preserved journal.

Recovery runbook:

- Stop concurrent installs into the same target.
- Read the JSON envelope from stderr and capture `recoveryJournal` when present.
- Inspect `.agent-plugins/installed/*.json` to identify managed files, source digest, payload digest, and adapter version.
- Compare managed files against the installed record before retrying.
- Retry the same install command after the target is stable.

## Compatibility and Upgrade Policy

Current versions:

| Surface | Version |
| --- | --- |
| Toolkit packages | `0.1.0` |
| Bundle schema | `1.0.0` |
| Release asset format | `upf-vendor-bundle/1` |
| Claude adapter | `1.0.0`, vendor schema `claude-code-plugins-2026-08-10` |
| Cursor adapter | `1.0.0`, vendor schema `cursor-plugins-2026-08-10` |
| Codex adapter | `1.0.0`, vendor schema `codex-plugins-2026-08-10` |
| Hello-world plugin | `1.0.0` |
| Unified Plugin Framework plugin | `0.1.0` |

The installer accepts an upgrade or reinstall only when the bundle validates against the selected adapter and target preflight succeeds. Adapter or vendor-schema identity mismatches fail before mutation. Plugin version movement is recorded in `.agent-plugins/installed/*.json`; compatibility is determined by bundle integrity and adapter ownership, not by hidden target state. Payload digests are published with each release in `SHA256SUMS` and inside each asset's `bundle.json`; they are not pinned in the documentation.

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
agent-plugin install <plugin> --vendor <host> --target <dir> --version <version>
  downloads SHA256SUMS and the asset, checks the asset digest, then every file and payload digest inside it
        |
        v
transactional installer
```

## Installation

Install a released plugin for one host by naming the plugin, the host and the release version. Use the version of a published [release](https://github.com/Monolith-INC/unified-plugin-framework/releases), such as `0.2.0` or `0.2.0-rc.1`:

```sh
agent-plugin install unified-plugin-framework --vendor claude --target <target-directory> --version <version>
agent-plugin install unified-plugin-framework --vendor cursor --target <target-directory> --version <version>
agent-plugin install unified-plugin-framework --vendor codex --target <target-directory> --version <version>
agent-plugin install project-knowledge --vendor claude --target <target-directory> --version <version>
agent-plugin install project-knowledge --vendor cursor --target <target-directory> --version <version>
agent-plugin install project-knowledge --vendor codex --target <target-directory> --version <version>
agent-plugin install hello-world --vendor claude --target <target-directory> --version <version>
agent-plugin install hello-world --vendor cursor --target <target-directory> --version <version>
agent-plugin install hello-world --vendor codex --target <target-directory> --version <version>
```

The command downloads the release's `SHA256SUMS`, then `<plugin>-<host>.bundle.json.gz`. Before anything is written it checks:

- the asset's SHA-256 against `SHA256SUMS` (`release.asset.digest_mismatch`);
- every payload file's digest, size and mode, and the payload digest, with the compiler's own bundle validation;
- that the asset holds the requested plugin for the requested host (`cli.release.identity`).

A release without the asset fails with `cli.release.asset_missing`; an unreachable release or a version that does not exist fails with `cli.release.download`. Assets are downloaded from `https://github.com/Monolith-INC/unified-plugin-framework/releases/download/v<version>/`; set `AGENT_PLUGIN_RELEASE_URL` to use a mirror that serves the same files.

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

For development, leave out `--version` and pass the plugin's source directory. The command builds the host payload from that checkout the same way the release build does, then installs it; nothing generated is kept. Build the workspace first so the CLI runs the current compiled output:

```sh
pnpm build
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/unified-plugin-framework --vendor claude --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/unified-plugin-framework --vendor cursor --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/unified-plugin-framework --vendor codex --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/hello-world --vendor claude --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/hello-world --vendor cursor --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/hello-world --vendor codex --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/project-knowledge --vendor claude --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/project-knowledge --vendor cursor --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/project-knowledge --vendor codex --target <target-directory>
```

A source install reflects the checkout as it is, including uncommitted edits, so it is the way to try a skill change on a host before it is released.

## Releasing

Push a tag named `v<version>` from `main`. The release workflow (`.github/workflows/release.yml`) installs, builds, runs `pnpm payloads:verify`, packs the assets with `pnpm release:assets`, and creates the GitHub release with every asset attached. A tag with a suffix, such as `v0.2.0-rc.1`, publishes a pre-release. Re-running the workflow for an existing release replaces its assets.

`pnpm payloads:verify` generates every shipped plugin's payload for every host into the git-ignored `packages/adapter-*/payloads/`, then generates them again and compares, so a build that is not deterministic, or not valid for its host, fails. `pnpm release:assets` packs those payloads into `release-assets/`, writes `SHA256SUMS`, and unpacks each archive again to prove it round-trips to the same payload digest. CI runs both on every pull request, so a release is never the first time a payload is built.

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

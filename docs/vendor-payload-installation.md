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

## Complete framework installation

Use the complete distribution for a new project. The interactive entry point starts with v0.2.2; choose a release listing `install.sh`. Earlier releases retain their documented `install.mjs --input` mode.

### Interactive installation

Run from the consuming project in a terminal:

```sh
bash <(curl -fsSL https://github.com/Monolith-INC/unified-plugin-framework/releases/latest/download/install.sh)
```

The launcher downloads and verifies the release installer. The wizard defaults to the current project, reuses saved settings, and lets you choose Codex, Claude Code, or both and select your workflows. Only hosts found on PATH start checked. Move with **↑/↓**, toggle a row with **Space**, select all rows with **All**, or toggle all with **a**. Press **Enter** to confirm a nonempty selection. Limited terminals show numbered choices. The final confirmation starts on **Cancel**, and **Ctrl+C** or **Ctrl+D** cancels a picker.

Complete setup supports Codex and Claude Code on Linux and requires Bash, curl, Node.js 22+ and Python 3.12+. Set `UPF_VERSION=<version>` to pin a release. If Python is missing, the launcher asks before downloading a checksum-verified `uv` and a pinned private Python. The wizard shows proposed changes, possible backups, and consent choices before applying setup. Headless knowledge discovery requires separate consent. A selected SCM tool may require GitHub CLI.

For Linear, set the credential environment required by the existing adapter (normally `LINEAR_API_KEY`); never enter the token into setup answers. New team/project selections use names or URLs resolved by the connector. Unavailable authentication or ambiguous scope is reported explicitly. A local tracker can be verified by a read-only search even when empty; setup never creates test work items.

The complete archive contains the CLI and production Node dependencies, canonical framework/knowledge sources and lock, all five unchanged pinned upstream repositories with supporting files/licenses, and the knowledge runtime source. Installed releases stage bundled plugins locally; missing or changed bundled content fails rather than downloading plugin repositories.

After confirmation, the installer places the verified distribution under `.upf-tools/distributions/<version>` and saves the accepted plan at `.upf-tools/setup-plan.json`. The report shows shared results once and verification for each selected host. It includes a local log and recovery instructions when available. Rerunning setup reuses completed steps. If the saved plan cannot be read, the installer asks the questions again and, after confirmation, keeps the old file beside the new one as `setup-plan.json.broken-<time>`.

| Exit code | Meaning |
| --- | --- |
| `0` | The selected checks passed. |
| `2` | A hand-off or user action remains. Follow the report. For a hand-off, say **Use the project-bootstrap skill to finish setup** in the next agent session. |
| `1` | Setup stopped, or the installer preserved a conflicting file or directory. Follow the recovery instruction. |

Use `--strict` to convert `2` to `1`. For automated readiness checks, also read the JSON `status` when using a plan that restricts `steps`.

The installed CLI depends on that distribution remaining available. Different/edited existing distributions and unsafe linked target paths are preserved by refusal. Archive checksum and link/path validation remain active.

### Automation and local files

An explicit plan file bypasses all prompts. Include the chosen `hosts` and explicit consent flags for optional actions. [Setup plan format](workflows/tooling-bootstrap.md#prepare-and-accept-one-plan-automation-or-agent-driven-setup)

```sh
node install.mjs --version <version> --project <existing-project> --input <accepted-plan.json>
```

In CI, use `install.mjs` from a verified release and set `UPF_VERSION` to that release's version. To allow pending hand-offs while failing on a stop, use this Bash step.

```bash
status=0
node ./install.mjs --version "$UPF_VERSION" --project "$PWD" --input ./accepted-plan.json || status=$?
case "$status" in
  0) ;;
  2) printf '%s\n' 'Setup requires follow-up. See the installer report.' ;;
  *) exit "$status" ;;
esac
```

If CI requires setup to finish in the job, pass `--strict` and let the command's exit code fail the step.

For a local artifact:

```sh
node install.mjs --version <version> --source ./unified-plugin-framework-<version>.tar.gz --checksums ./SHA256SUMS --project <existing-project> --input <accepted-plan.json>
```

`--dest` is an alias for `--project`; `--python` selects the extraction executable. The `install.mjs` file is published next to the complete archive. Local files can also be supplied in interactive mode by omitting `--input`. Without a terminal, omission of `--input` fails with an explanation rather than guessing or accepting defaults silently.

### Building and checking the complete distribution

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm release:assets
UPF_RELEASE_VERSION=<version> pnpm release:distribution
UPF_RELEASE_VERSION=<version> node packages/cli/scripts/check-distribution.mjs
```

The build fetches and verifies all pinned sources before packaging and deploys the existing CLI using pnpm's production deployment. Publication includes the complete archive and installer in `SHA256SUMS` and build attestations. CI tests relocation outside the checkout, CLI execution, both host payloads, all five dependency staging operations with fetching denied, re-entry, and refusal of source/staged drift. This is artifact evidence; live Codex activation and a real-project workflow trial remain distinct checks.

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

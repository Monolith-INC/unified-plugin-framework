# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Host payloads are no longer committed. The repository keeps one copy of each plugin, its source under `plugins/`; `packages/adapter-*/payloads/` is git-ignored build output ([AGE-104](https://linear.app/agentical-monolithics/issue/AGE-104)).
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds every shipped plugin for Claude, Cursor and Codex and attaches `<plugin>-<host>.bundle.json.gz` assets plus `SHA256SUMS` to the GitHub release; tags with a suffix such as `-rc.1` publish pre-releases.
- `agent-plugin install <plugin> --version <version> --vendor <host> --target <dir>` downloads the release asset over HTTPS (with a timeout), checks it against `SHA256SUMS` and every digest inside it, then installs it. `install --source <plugin-directory>` builds the payload from a source directory for development. Each release asset carries a build provenance attestation.
- The release workflow publishes only tags shaped like `v0.2.0` or `v0.2.0-rc.1` that are on `main` and pass the full CI suite; it can be run by hand to publish an existing tag again.
- `pnpm payloads:verify` now generates the payloads and checks the build is deterministic and valid instead of comparing against committed copies; `pnpm release:assets` packs and round-trips the release assets. CI runs both on every pull request. The `cli.payload.missing` and `cli.payload.drift` install errors are gone, and payload digests are no longer pinned in the documentation.

### Breaking

- `install <plugin-directory> --vendor --target` is now `install --source <plugin-directory> --vendor --target`; a plugin name without `--version` fails with `cli.arguments.mode`.
- `runInstallCommand` always returns `Promise<number>`, and `InstallCommandRuntime.resolve` takes one `BundleSource` (`{ kind: "release", plugin, version, vendor }` or `{ kind: "source", root, vendor }`) and returns a promise.
- `resolveShippedBundle` is replaced by `resolveSourceBundle` in `packages/cli/src/bundle-source.ts`.
- The adapter packages no longer export `claudeShippedBundle`, `codexShippedBundle`, `cursorShippedBundle` or the `*_SHIPPED_HELLO_WORLD` constants, and no longer publish `payloads/`.

### Added

- `@agent-plugins/compiler/railway`: `andThen`, `andThenAsync`, `failureOf`, `fromDiagnostics`, `sequenceResults`, the `resultListMonoid` and `isRecord`.
- `buildVendorBundle` in `@agent-plugins/workflows` builds one host's bundle from a source directory in memory and reports a missing directory as `release.source.unreadable`.

## M4 Vendor Payload Compiler & Transactional Installer

### Added

- Deterministic `@agent-plugins/compiler` contracts for canonical plugins, vendor bundles, file digests, install plans, installed records, journals, and result envelopes
- Claude, Cursor, and Codex adapter packages with schema evidence, shared conformance coverage, and verified adapter-owned `hello-world@1.0.0` payloads
- `@agent-plugins/installer` transactional install engine with target locks, same-filesystem staging, durable journals, exact rollback, installed-record verification, stale owned-file cleanup, and unchanged reinstall detection
- `agent-plugin install <plugin> --vendor <claude|cursor|codex> --target <directory>` as the single shipped-payload install command
- CI and local release evidence for payload drift, bundle conformance, installer rollback, permission failure, lifecycle coverage for all three vendors, documentation command verification, package contents, and provenance placement
- M4 documentation covering canonical authoring, adapter conformance, installation, rollback/recovery, compatibility policy, payload digests, and release notes

## [0.1.0] - 2026-08-09

Initial M1 portable-core release of the Agent Plugins Toolkit.

### Added

- Monorepo packages `@agent-plugins/core`, `@agent-plugins/cli`, and `@agent-plugins/testing`
- `loadPluginRoot` / `inspectPlugin` / `inspectManifest` with structured diagnostics
- v1 portable manifest validation: required fields, npm-style names, `schemaVersion`, closed-field rejection, opaque `extensions`
- Immediate-child Skill discovery with deterministic ordering and missing-`SKILL.md` diagnostics
- MCP `mcp.json` parsing for `stdio`, `streamable-http`, `sse`, and `config-path` transports
- Explicit `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` placeholder reporting on inspected MCP servers
- CLI commands `agent-plugin validate` and `agent-plugin inspect` (path argument or cwd default)
- Reference plugin `plugins/hello-world` and validate/inspect fixtures under `fixtures/`

### Safety

- Validation and inspection stay filesystem/JSON-only: no plugin script execution, no MCP process spawn, no remote connections

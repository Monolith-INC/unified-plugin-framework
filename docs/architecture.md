# Agent Plugins Toolkit Architecture

The toolkit is a pnpm workspace with explicit package boundaries:

- `packages/core` — portable data types, diagnostics, and inspection primitives (`loadPluginRoot`, `inspectPlugin`, `inspectManifest`)
- `packages/compiler` — canonical plugin normalization, deterministic bundle contracts, byte/mode hashing, and payload determinism verification
- `packages/adapter-claude` — Claude Code payload rendering, validation, install planning, schema evidence, and the payload build script
- `packages/adapter-cursor` — Cursor payload rendering, validation, install planning, schema evidence, and the payload build script
- `packages/adapter-codex` — Codex payload rendering, validation, install planning, schema evidence, and the payload build script
- `packages/installer` — lock, stage, journal, commit, verify, cleanup, rollback, and installed-record handling for target directories
- `packages/cli` — command-line entrypoints (`agent-plugin validate|inspect|install|create|add skill|adapter-check`)
- `packages/workflows` — the workflow adapter interface, readiness check, workflow contracts and the frozen adapters that fulfil them with onboarded plugins ([ADR-001](adr/ADR-001-workflow-adapter-interface.md))
- `packages/testing` — shared fixtures helpers for package tests

## Portable inspection model

`loadPluginRoot(path)` reads a plugin directory and returns a `PluginInspection`:

- `manifest` — typed portable fields when valid
- `skills` — discovered immediate Skills (when any)
- `mcpServers` — discriminated MCP transport entries (when any)
- `diagnostics` — structured, component-scoped findings

Partial results are preserved when some components fail: diagnostics accumulate while valid siblings remain available.

## Non-goals for core

Client-specific runtime code (hooks execution, MCP process supervision, marketplace packaging) stays outside `packages/core`. The portable core loads and validates; hosts decide how to run.

## Vendor payload installation model

Plugins have one copy in the repository, their portable source. Host payloads are build output: CI generates them and publishes them as GitHub release assets (AGE-104).

```text
portable plugin source (git)
        |
        v  tag v<version> -> .github/workflows/release.yml
release-time assembly + canonical compiler model, once per host adapter
        |
        v
release assets: <plugin>-<host>.bundle.json.gz + SHA256SUMS
        |
        v
agent-plugin install <plugin> --version  (download, check digests)
        |
        v
transactional target mutation
```

For development, `agent-plugin install --source <plugin-directory>` runs the same assembly and compiler on a source checkout in a temporary directory and installs the result; nothing generated is kept.

Vendor payload provenance is stored in the toolkit `bundle.json` envelope inside each release asset. Closed vendor files such as `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `.codex-plugin/plugin.json` contain only fields accepted by their owning adapter schema.

The installer receives a verified bundle and an adapter. It never compiles portable source, fetches remote artifacts, executes plugin content, or bypasses the shared transaction engine. Downloading is the CLI's job and lives in one edge module (`packages/cli/src/release-download.ts`): it fetches `SHA256SUMS` and the asset, and hands over a bundle only after the asset digest, every file digest and the payload digest check out. Those checks prove integrity; each asset's build provenance attestation proves it came from this repository's release workflow.

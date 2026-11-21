# Agent Plugins v1.0.0 Compliance Audit, Migration Plan & Architecture Comparison

**Date:** 2026-11-20  
**Branch:** `feature/agent-plugins-v1-compliance` (cut from `origin/main` at `7c81074`)  
**Target Standard:** [Agent Plugins Specification v1.0.0](https://agent-plugins.org/specification) (`plugin.schema.json` & `mcp.schema.json`)

---

## Part 1: Compliance Audit

Running an Agent Plugins v1.0.0 conformance check against UPF's bundled plugins (`plugins/*`) and inspecting `packages/core`, `packages/compiler`, and `packages/adapter-*` reveals that UPF currently **rejects** a plugin written strictly to the published v1.0.0 specification, and none of UPF's four bundled plugins pass v1.0.0 validation.

### 1.1 Bundled Plugins (`plugins/*`)

| Plugin | Status | Findings |
| --- | :---: | --- |
| `plugins/hello-world` | FAIL | Missing required `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`. |
| `plugins/project-knowledge` | FAIL | Missing required `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`. |
| `plugins/translation` | FAIL | Missing required `$schema`; uses non-standard `schemaVersion: "1.0.0"`. Its `mcp.json` uses a bare server map without `$schema`, `mcpServers` wrapper, or `"type": "stdio"`. |
| `plugins/unified-plugin-framework` | FAIL | Missing required `$schema`; uses non-standard `schemaVersion: "1.0.0"`. |

### 1.2 Core Loader & Scaffolder (`packages/core/src/index.ts`, `packages/core/src/author.ts`)

| Spec Area | Agent Plugins v1.0.0 Requirement | Current UPF Behavior |
| --- | --- | --- |
| **Manifest `$schema` (§5.2, §5.3)** | Required; MUST be `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Missing or unsupported value rejects the plugin. | `$schema` is rejected as an unknown field. UPF uses its own `schemaVersion: "1.0.0"` field and scaffolds `schemaVersion` in `buildPluginManifestJson()`. |
| **Unknown top-level fields (§5.2)** | Schema violation, but **non-fatal**: report (warning) and ignore; continue loading. | Treated as fatal error (`isManifestRejection`), rejecting the entire plugin with a message claiming v1.0.0 forbids the field. |
| **Metadata fields (§5.4)** | Optional `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords` (validated by JSON type only). | `version` is required; `homepage`, `repository`, and `keywords` are rejected as unknown fields. `author` requires non-empty `name` (tighter than spec's optional string fields, though required by Claude Code's validator). |
| **Non-object `extensions` (§8.1)** | Non-fatal: report (warning) and ignore; continue loading components. | Emits an error diagnostic. |
| **Plugin `name` (§5.5)** | 1–64 chars, `a-z`, `0-9`, `-`, `.`, start/end alphanumeric, no `--` or `..`: `^(?!.*(?:--\|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`. | `PLUGIN_NAME_PATTERN` allows `@scope/` and `--`, rejects `.`, and caps segment length at 63. |
| **`mcp.json` top-level shape (§7.2.1, §10.1)** | Closed object with required `$schema` (`https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`, matching `plugin.json` version) and `mcpServers`. | Accepts bare server map without `$schema` or `mcpServers` wrapper; does not validate `$schema` or version alignment. |
| **MCP server entries (§7.2.1, §9.2)** | Closed variants (`stdio`, `streamable-http`, `sse`) with explicit `type`; `stdio` supports `env` (forbidding `PLUGIN_ROOT`/`PLUGIN_DATA`), `cwd` prefix/containment, no placeholder in `command`; remote transports support `headers` (no case-insensitive duplicates) and HTTPS enforcement for non-loopback URLs. | Omits `env` on `stdio` and `headers` on `streamable-http`/`sse`; infers transport when `type` is omitted; accepts inline `mcpServers`/`skills` in `plugin.json` and non-standard `config-path` transport. |
| **Extension namespace ownership (§8)** | Reverse-domain namespace controlled by the owning client. | `packages/compiler` uses `org.agent-plugins.distribution` (under `agent-plugins.org`'s domain) rather than `io.github.monolith-inc.upf.distribution` (or `io.github.monolith-inc.upf`). |

### 1.3 Documentation (`docs/agent-plugins-specification.md`)

- Line 80 of `docs/agent-plugins-specification.md` (when present) shows `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` inside its `mcp.json` example instead of `mcp.schema.json`.

---

## Part 2: Detailed Migration & Implementation Plan

To align UPF with Agent Plugins v1.0.0 while preserving backwards compatibility for existing UPF/toolkit plugins and keeping all host adapters (`claude`, `codex`, `cursor`) passing their validators:

### Phase 1 — Core Manifest & Naming Compliance (`packages/core`)

1. **Add canonical constants:**
   - `PLUGIN_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`
   - `MCP_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"`
2. **Update `PluginManifest` interface and `PORTABLE_MANIFEST_FIELDS`:**
   - Add optional `$schema?: string`, `homepage?: string`, `repository?: string`, `keywords?: readonly string[]`.
   - Make `version?: string` optional in `PluginManifest` (downstream compiler/adapters enforce SemVer `version` when building vendor bundles, since Claude/Codex/Cursor manifests require it).
   - Keep `schemaVersion?: string` for backwards-compatible reading with a deprecation warning.
3. **Implement `$schema` validation (§5.2, §5.3):**
   - Accept `"$schema": PLUGIN_SCHEMA_URL` with zero warnings.
   - Reject any other `$schema` value with a fatal error naming the supported URL.
   - When `$schema` is absent:
     - If `schemaVersion === "1.0.0"`, allow loading with a `warning` naming the fix (`"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"`).
     - Otherwise, reject with a fatal error naming the required `$schema` value (unless in legacy declaration mode without schemaVersion? No — spec requires `$schema` on manifests; we'll check existing tests carefully to ensure intentional legacy test cases are handled cleanly).
4. **Make unknown top-level fields and non-object `extensions` non-fatal (§5.2, §8.1):**
   - Change `manifestUnknownField` severity from `"error"` to `"warning"` and remove it from `isManifestRejection()`. Update message so it never claims v1.0.0 forbids a valid field.
   - Change `manifestExtensionsInvalidType` severity to `"warning"` and ignore the field so components still load.
5. **Update plugin name validation (§5.5):**
   - Primary spec regex: `^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$` with length `1..64`.
   - Legacy `@scope/name` names: emit a `warning` naming the v1.0.0 rule and continue loading.
   - Update `buildPluginManifestJson()` to scaffold `"$schema": PLUGIN_SCHEMA_URL` (no `schemaVersion`).

### Phase 2 — Core MCP Configuration Compliance (`packages/core`)

1. **Support full v1.0.0 `mcp.json` top-level validation (§7.2.1, §10.1):**
   - Accept `{ "$schema": MCP_SCHEMA_URL, "mcpServers": { ... } }` cleanly with zero warnings.
   - Reject mismatched/unsupported `mcp.json#$schema` or unknown top-level fields in wrapped `mcp.json` (disabling MCP only, preserving skills).
   - Keep reading bare server maps (legacy UPF form) with a `warning` naming the `{ "$schema", "mcpServers" }` wrapper.
   - Keep reading missing `type` (inferred stdio), inline `mcpServers` in `plugin.json`, and `config-path` transport with clear `warning` diagnostics naming the v1.0.0 form.
2. **Extend `PluginMcpServer` types & validation:**
   - Add `env?: Readonly<Record<string, string>>` to `stdio` variant; reject reserved keys `PLUGIN_ROOT` and `PLUGIN_DATA` (§9.2); collect placeholders from `env` values (and NOT from `command` or remote `url`/`headers` per §9.2!).
   - Add `headers?: Readonly<Record<string, string>>` to `streamable-http` and `sse` variants; reject case-insensitive duplicate header names (§7.2.1).
   - Validate remote `url` (absolute `http`/`https`, no userinfo/fragment, HTTPS required for non-loopback hosts).

### Phase 3 — Compiler & Extension Namespace Alignment (`packages/compiler`)

1. **Move distribution extension to a UPF-controlled namespace (§8):**
   - Introduce `UPF_DISTRIBUTION_EXTENSION = "io.github.monolith-inc.upf.distribution"` as the primary namespace.
   - Continue reading legacy `CANONICAL_DISTRIBUTION_EXTENSION = "org.agent-plugins.distribution"` as a fallback with a deprecation warning (when both are absent, default empty distribution).
2. **Handle optional `manifest.version` cleanly:**
   - In `loadCanonicalPlugin()`, if `manifest.version` is absent, fail canonical bundle compilation with a clear diagnostic (since `VendorBundleManifest` and all 3 host adapters require a SemVer `version`), while `loadPluginRoot()` / `agent-plugin validate` continues to accept versionless portable plugins per v1.0.0.
3. **Preserve `env` and `headers` in host adapters where supported (`packages/adapter-*`):**
   - Forward `env` on `stdio` MCP entries in Claude/Codex/Cursor adapters if present, and `headers` on remote MCP entries in Claude/Cursor adapters where supported.

### Phase 4 — Migrate Bundled Plugins & Tests (`plugins/*`, `fixtures/*`, `packages/*/test`)

1. Update all 4 plugins under `plugins/`:
   - Add `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` to `hello-world`, `project-knowledge`, `translation`, and `unified-plugin-framework`.
   - Remove `schemaVersion` from `translation` and `unified-plugin-framework`.
   - Update `plugins/translation/mcp.json` to the v1.0.0 `{ "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "mcpServers": { "terminology": { "type": "stdio", ... } } }` format.
2. Add comprehensive unit & integration tests covering every acceptance criterion:
   - Spec-compliant fixture plugin (skills + `mcp.json` with `env`/`headers`) passes `agent-plugin validate` with 0 errors and 0 warnings.
   - All 4 plugins under `plugins/` pass `agent-plugin validate` with 0 errors and 0 warnings (and pass `Open_Plugin_Template/scripts/validate_plugin.py`).
   - Legacy fixture (`schemaVersion`, `@scope/name`, bare `mcp.json`, missing `type`, `org.agent-plugins.distribution`) loads with clear warnings.
   - Unknown top-level field & non-object `extensions` load with warnings.
   - Unsupported `$schema` rejects the plugin naming the supported URL.
   - All host payloads (Claude, Codex, Cursor) build and verify cleanly.

---

## Part 3: Architecture Comparison — UPF (`compiler` + `adapter-*`) vs. `Open_Plugin_Template`

Both repositories target the **Agent Plugins v1.0.0** portable package format, but they serve complementary layers of the plugin lifecycle:

| Dimension | `Open_Plugin_Template` | UPF (`packages/core` + `compiler` + `adapter-*` + `installer`) |
| --- | --- | --- |
| **Primary role** | Authoring reference, specification manual, copyable v1.0.0 template plugin, and standalone zero-dependency validator. | Production TypeScript toolchain that **compiles** portable plugin sources into host-native payloads and **installs** them transactionally with supply-chain verification. |
| **Source format** | Pure Agent Plugins v1.0.0 (`plugin.json`, `skills/`, `mcp.json`, reverse-domain extension dir). | Pure Agent Plugins v1.0.0 source in `plugins/*`, plus UPF-owned extensions (`io.github.monolith-inc.upf` for onboarded workflow plugins, `io.github.monolith-inc.upf.distribution` for canonical rules & hook intents). |
| **Validation model** | `scripts/validate_plugin.py` — single-pass strict v1.0.0 checker against the normative spec & schemas. | `packages/core` (`loadPluginRoot`, `inspectManifest`, `inspectPlugin`) — returns typed `PluginInspection` with structured component-scoped `Diagnostic[]` and partial-result isolation, plus backwards-compatible deprecation warnings. |
| **Host delivery** | Assumes a natively conformant Agent Plugins v1.0.0 client loads the directory directly. | Bridges today's non-uniform hosts by compiling a `CanonicalPlugin` IR into deterministic, SHA-256-hashed `VendorBundle` payloads: `.claude-plugin/plugin.json` + `.mcp.json` (Claude), `.codex-plugin/plugin.json` + `.mcp.json` with `mcp_servers` (Codex), `.cursor-plugin/plugin.json` + `rules/*.mdc` + `mcp.json` (Cursor). |
| **Hooks & Rules** | Left strictly to client-specific reverse-domain extension directories (non-portable). | Models portable `CanonicalRule` and `CanonicalHookIntent` inside a UPF extension, then translates them per host (e.g., Cursor `.mdc` rules + `hooks.json`, Claude/Codex `PreToolUse`/`PostToolUse` matchers, explicit rejection when a host lacks native rules). |
| **Installation & Integrity** | Out of scope (delegated to the client, per v1.0.0). | `packages/installer` + `packages/cli` — downloads release bundles, verifies `SHA256SUMS` + file digests + payload digest, and applies atomic journaled/rollback-capable target mutations. |

**How they work best together:**
`Open_Plugin_Template` defines the clean, vendor-neutral **authoring contract** and strict compliance oracle (`scripts/validate_plugin.py`), while UPF's `compiler` + `adapter-*` pipeline provides the **distribution and host-translation bridge** for clients that have not yet natively adopted root `plugin.json` + `mcp.json`. Aligning UPF's `packages/core` and `plugins/*` with v1.0.0 ensures any plugin authored from `Open_Plugin_Template` compiles cleanly through UPF, and every UPF plugin is natively loadable by any conformant Agent Plugins v1.0.0 client without translation.

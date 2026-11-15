# Unified Plugin Framework

[![Status](https://img.shields.io/badge/status-foundation-orange)](https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.14-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Upstream](https://img.shields.io/badge/upstream-Agent_Plugins_Toolkit-blue)](https://github.com/Monolith-INC/agent-plugins-toolkit)

A reference implementation of an independent Unified Plugin Contract: declare plugin dependencies, discover exported capabilities, compose adapters and overlays, and coordinate safe installation and updates.

This repository is a linked fork of [Agent Plugins Toolkit](https://github.com/Monolith-INC/agent-plugins-toolkit). The inherited toolkit works today; dependency composition, capability matching, overlays, and coordinated updates are planned work.

> **Core principle:** one shared planner describes the changes; separately approved operations apply them.

## Why this exists

Plugins need a shared way to describe what they depend on and what they offer. The framework will make those relationships explicit so tools can check compatibility before changing an installation, preserve dependency source files, and recover when an operation fails.

## Project and roadmap

Planning and delivery are tracked in [Unified Plugin Framework on Linear](https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview).

| Stage | Planned outcome |
| --- | --- |
| Fork foundation | Record the upstream baseline, establish ownership and verify inherited behavior |
| Composition foundation | Independent contract, dependency resolution, capability matching and read-only planning |
| Managed composition | Approved graph installation, capability broker and source-preserving wrappers |
| Lifecycle and portability | Compatible updates, recovery and verified host support |

See the [implementation plan](https://linear.app/agentical-monolithics/document/implementation-plan-v02-fork-first-75791b38aa14) and [architecture and research](https://linear.app/agentical-monolithics/document/unified-plugin-contract-architecture-and-research-c56dbc4f9dd4).

## Development setup

Requires Node.js 22 or newer and pnpm 10.14.0, as pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm payloads:verify
```

## Delivery tooling

This checkout uses [Monolithic Dev Harness v0.7.0-rc.13](https://github.com/Monolith-INC/monolithic-dev-harness/releases/tag/v0.7.0-rc.13), installed for this project in Codex. Work belongs to the Linear project above; plans and specifications belong under `docs/work-items/`.

To install the same release for another checkout:

```sh
gh release download v0.7.0-rc.13 --repo Monolith-INC/monolithic-dev-harness --pattern install.sh --output install-harness.sh
bash install-harness.sh --version 0.7.0-rc.13 --scope local --host codex --project "$PWD" --yes
```

## Upstream baseline and licensing

Forked from `Monolith-INC/agent-plugins-toolkit` at commit [`b75aaa5c627599f1fdb25caff154e9a22d2e2640`](https://github.com/Monolith-INC/agent-plugins-toolkit/commit/b75aaa5c627599f1fdb25caff154e9a22d2e2640) on 2026-11-14. Original history and package names are preserved. Use the `upstream` remote to review future changes before merging them through a pull request.

Licensed under the [Apache License 2.0](LICENSE). The inherited baseline had no license file; the owner's ownership statement, the license decision and their dates are recorded in [docs/upstream/ownership.md](docs/upstream/ownership.md). Package publication is not decided, and inherited package names are unchanged.

## Inherited toolkit

The following reference describes the existing toolkit behavior.

Reference implementation and CLI for the Agent Plugins v1.0.0 portable architecture.

The toolkit loads plugin roots, validates portable manifests, discovers immediate Skills, inspects MCP configuration **without executing** plugin scripts or starting MCP servers, and ships verified vendor payloads through one transactional install command.

## Packages

| Package | Role |
|---|---|
| `@agent-plugins/core` | Portable types, diagnostics, and `loadPluginRoot` / `inspectPlugin` primitives |
| `@agent-plugins/compiler` | Canonical plugin normalization, deterministic vendor bundle contracts, build, and drift verification |
| `@agent-plugins/adapter-claude` | Claude Code adapter plus verified `hello-world` payload |
| `@agent-plugins/adapter-cursor` | Cursor adapter plus verified `hello-world` payload |
| `@agent-plugins/adapter-codex` | Codex adapter plus verified `hello-world` payload |
| `@agent-plugins/installer` | Transactional payload installer with locking, journaling, rollback, and installed-record verification |
| `@agent-plugins/cli` | `agent-plugin` CLI (`validate`, `inspect`, `install`, `create`, `add skill`) |
| `@agent-plugins/testing` | Shared test helpers |

## Requirements

- Node.js `>= 22`
- pnpm `10.x` (see `packageManager` in root `package.json`)

## Setup

```sh
pnpm install
pnpm build
pnpm test
pnpm payloads:verify
```

## CLI

Build first so the `agent-plugin` bin points at compiled output:

```sh
pnpm build
pnpm --filter @agent-plugins/cli exec agent-plugin --help
```

### `install <plugin> --vendor <claude|cursor|codex> --target <directory>`

Install exactly one verified, adapter-owned shipped payload. Build first so the `agent-plugin` bin points at compiled output.

```text
plugins/hello-world
  plugin.json
  skills/hello-world/SKILL.md
        |
        v
@agent-plugins/compiler
        |
        +-- @agent-plugins/adapter-claude -> packages/adapter-claude/payloads/hello-world
        +-- @agent-plugins/adapter-cursor -> packages/adapter-cursor/payloads/hello-world
        +-- @agent-plugins/adapter-codex  -> packages/adapter-codex/payloads/hello-world
        |
        v
agent-plugin install -> @agent-plugins/installer -> target directory
```

```sh
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/hello-world --vendor claude --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/hello-world --vendor cursor --target <target-directory>
pnpm --filter @agent-plugins/cli exec agent-plugin install plugins/hello-world --vendor codex --target <target-directory>
```

The command reads a shipped bundle from the selected adapter package, validates the bundle identity and file digests, plans writes through that adapter, then commits the transaction under a target lock. Installer provenance lives in `.agent-plugins/installed/*.json`; vendor manifests remain closed to each vendor schema.

### `validate [path]`

Validate a plugin root. Defaults to the current working directory.

- Success: prints `{"ok":true}` and exits `0`
- Failure: prints JSON diagnostics on stderr and exits `1`

```sh
pnpm --filter @agent-plugins/cli exec agent-plugin validate plugins/hello-world
pnpm --filter @agent-plugins/cli exec agent-plugin validate fixtures/invalid/missing-name
```

### `inspect [path]`

Inspect portable components as deterministic JSON (manifest, skills, MCP servers, diagnostics). Defaults to cwd.

```sh
pnpm --filter @agent-plugins/cli exec agent-plugin inspect plugins/hello-world
pnpm --filter @agent-plugins/cli exec agent-plugin inspect fixtures/valid/mcp-transports
```

## Plugin layout

A portable plugin root looks like:

```text
plugin.json          # required portable manifest
skills/<name>/SKILL.md
mcp.json             # optional MCP server map
```

### Manifest (`plugin.json`)

Closed portable fields:

- `name` (required, lowercase npm-style, optional `@scope/`)
- `version` (required)
- `description` (optional string)
- `schemaVersion` (optional; supported: `1.0.0`)
- `extensions` (optional opaque object; preserved, not interpreted)

### Skills

Only **immediate** children of `skills/` are discovered. Nested `SKILL.md` files are ignored. Missing `SKILL.md` yields a structured diagnostic.

### MCP (`mcp.json`)

Missing `mcp.json` is valid. Present configs are parsed into discriminated transports:

- `stdio` — `command` / `args` / optional `cwd`
- `streamable-http` — `url` (+ `type` or `transport`)
- `sse` — `url` (+ `type` or `transport`)
- `config-path` — path reference to another MCP config

`${PLUGIN_ROOT}` and `${PLUGIN_DATA}` placeholders found in path-like fields are listed explicitly on each inspected server under `placeholders`.

Inspection never spawns processes or opens network connections.

## Fixtures & reference plugin

- `plugins/hello-world` — minimum valid reference plugin
- `fixtures/valid/*` — happy-path fixtures (including skill discovery and MCP transports)
- `fixtures/invalid/*` — diagnostic category coverage for validate/inspect

## Library usage

```ts
import { loadPluginRoot, inspectPlugin } from "@agent-plugins/core";

const inspection = loadPluginRoot("./plugins/hello-world");
// inspection.manifest | skills | mcpServers | diagnostics
```

## Documentation

- [Architecture](docs/architecture.md)
- [Vendor payload installation guide](docs/vendor-payload-installation.md)
- [M4 release notes](docs/release-notes/age-13-m4.md)
- [Changelog](CHANGELOG.md)

## Scripts

```sh
pnpm install
pnpm build
pnpm build:core
pnpm build:cli
pnpm build:testing
pnpm payloads:build
pnpm payloads:verify
pnpm typecheck
pnpm test
```

## Quality gates

See [docs/quality-gates.md](docs/quality-gates.md) for the required local and CI checks (Linux, macOS, Windows).

## Translation plugin dogfood

See [docs/translation-plugin-dogfood.md](docs/translation-plugin-dogfood.md) for the M3 multi-Skill portable consumer and its intentional non-goals.

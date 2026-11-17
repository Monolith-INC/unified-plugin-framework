# Unified Plugin Framework

[![Status](https://img.shields.io/badge/status-foundation-orange)](https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.14-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Upstream](https://img.shields.io/badge/upstream-Agent_Plugins_Toolkit-blue)](https://github.com/Monolith-INC/agent-plugins-toolkit)

A project companion for agent-assisted development. It offers workflows such as code review, Discovery and project tracking, each built on outside plugins the framework onboards as dependencies.

This repository is a linked fork of [Agent Plugins Toolkit](https://github.com/Monolith-INC/agent-plugins-toolkit). The inherited toolkit works today; the workflows are being built on top of it.

> **Core principle:** each workflow keeps a stable contract with its users; the plugin behind it can change.

## How it works

- **Workflows** are what users and their agents work with: code review, Discovery and planning, project tracking, continuity across sessions.
- **Each workflow has a workflow adapter.** The adapter is the workflow's contract, the skills and tools it exposes, and it maps that contract onto the plugin that currently does the work.
- **Onboarded plugins** are ordinary dependencies, such as the Monolithic Code Review Toolkit, Superpowers or BMad Method. They are declared with a version, pinned, and upgraded only when the adapter's tests still pass. Replacing a plugin means adjusting its adapter's mapping; the contract stays the same.
- **Project knowledge** is shared by every workflow through one knowledge store per project.

The full design is in the [workflow adapter architecture](docs/work-items/2026-11-15-workflow-adapter-architecture.md).

## Project and roadmap

Planning and delivery are tracked in [Unified Plugin Framework on Linear](https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview).

| Stage | Outcome |
| --- | --- |
| Fork foundation | Done: upstream baseline recorded, ownership established, inherited behavior verified |
| First workflow: code review | Shared project knowledge, onboarded plugins declared and pinned, and code review working through its adapter |
| Discovery | Discovery and planning through an adapter over Superpowers and BMad Method |
| Further workflows | Project tracking, continuity, and the remaining workflows, one adapter at a time |

## Development setup

Project operations use a saved tracker adapter and project language. Missing choices are collected once by `project-bootstrap`, which resumes the operation; subsequent requests use the adapter directly. See [project setup and tracker adapters](docs/user-journey.md#project-setup-and-tracker-adapters).

The host skills use the framework CLI. For this source checkout, after install/build, run `pnpm agent-plugin project describe --project <target-project>`. An installed host payload needs the CLI available alongside its skills; the payload alone does not bundle Node dependencies. The skills report a missing CLI as an installation prerequisite and preserve the request.

For complete Codex setup, `pnpm agent-plugin project bootstrap --input <plan.json> --project <target-project>` reports reused and missing tooling without installing. After accepting the concrete plan, add `--apply` to install the shipped framework/knowledge skills, activate pinned workflow dependencies, configure the isolated knowledge runtime and shared store, connect review settings and verify host discovery and tracker access. Missing knowledge content or provider bindings are completed through their existing skills before rerunning the accepted plan. See the [tooling bootstrap guide](docs/workflows/tooling-bootstrap.md).

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

Forked from `Monolith-INC/agent-plugins-toolkit` on 2026-11-14. Original history and package names are preserved. The pinned baseline commit, fork details and the clone procedure, including adding the `upstream` remote, are in [docs/upstream/baseline.md](docs/upstream/baseline.md). Review upstream changes through that remote before merging them through a pull request.

Copyright 2026 Monolith-INC. Licensed under the [Apache License 2.0](LICENSE); see also [NOTICE](NOTICE). The inherited baseline had no license file; the owner's ownership statement, the license decision and their dates are recorded in [docs/upstream/ownership.md](docs/upstream/ownership.md). Package publication is not decided, and inherited package names are unchanged.

## Inherited toolkit

The following reference describes the existing toolkit behavior.

Reference implementation and CLI for the Agent Plugins v1.0.0 portable architecture.

The toolkit loads plugin roots, validates portable manifests, discovers immediate Skills, inspects MCP configuration **without executing** plugin scripts or starting MCP servers, and installs verified host payloads through one transactional install command. The repository holds only canonical plugin sources; CI builds each host's payloads and attaches them to the GitHub release.

## Packages

| Package | Role |
|---|---|
| `@agent-plugins/core` | Portable types, diagnostics, and `loadPluginRoot` / `inspectPlugin` primitives |
| `@agent-plugins/compiler` | Canonical plugin normalization, deterministic vendor bundle contracts, build, and determinism verification |
| `@agent-plugins/adapter-claude` | Claude Code adapter and its payload build script |
| `@agent-plugins/adapter-cursor` | Cursor adapter and its payload build script |
| `@agent-plugins/adapter-codex` | Codex adapter and its payload build script |
| `@agent-plugins/installer` | Transactional payload installer with locking, journaling, rollback, and installed-record verification |
| `@agent-plugins/cli` | `agent-plugin` CLI (`validate`, `inspect`, `install`, `create`, `add skill`, `adapter-check`) |
| `@agent-plugins/workflows` | Workflow contracts and their adapters; see [ADR-001](docs/adr/ADR-001-workflow-adapter-interface.md) and the [code review workflow](docs/workflows/code-review.md) |
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

### `install <plugin> --version <version> | --source <dir>`, with `--vendor <claude|cursor|codex> --target <directory>`

Install one plugin's payload for one host.

```text
plugins/<plugin>            (hello-world, unified-plugin-framework, project-knowledge) -- the only copy in git
  plugin.json
  skills/<skill>/SKILL.md
        |
        v  tag v<version>  ->  .github/workflows/release.yml
release-time assembly (@agent-plugins/workflows) -> @agent-plugins/compiler -> adapter-claude | adapter-cursor | adapter-codex
        |
        v
GitHub release assets: <plugin>-<host>.bundle.json.gz for every plugin and host, plus SHA256SUMS
        |
        v
agent-plugin install <plugin> --version -> download + digest checks -> @agent-plugins/installer -> target directory
```

With a plugin name and `--version`, the command downloads the plugin's asset for the host from that release, checks it against the release's `SHA256SUMS` and every file digest inside it, then installs it. Each asset also carries a build provenance attestation (`gh attestation verify`):

```sh
agent-plugin install unified-plugin-framework --version <version> --vendor claude --target <target-directory>
```

With `--source`, it takes a plugin source directory and builds the payload from it instead, for development:

```sh
pnpm agent-plugin install --source plugins/unified-plugin-framework --vendor claude --target <target-directory>
```

Either way the installer plans writes through the host's adapter and commits the transaction under a target lock. Installer provenance lives in `.agent-plugins/installed/*.json`; vendor manifests remain closed to each vendor schema. The [installation guide](docs/vendor-payload-installation.md) lists every plugin and host, the release process and the failure codes.

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
- `extensions` (optional object; preserved. Other namespaces are not interpreted.)

### Onboarded plugins

The framework declares the outside plugins its workflows depend on under one namespace in `extensions`:

```json
"extensions": {
  "io.github.monolith-inc.upf": {
    "onboardedPlugins": [
      {
        "name": "monolithic-code-review-toolkit",
        "version": "^1.0.0",
        "source": "github:Monolith-INC/monolithic-code-review-toolkit",
        "adapter": "code-review"
      }
    ]
  }
}
```

Each entry needs a non-empty `name`, `version` range, `source` and `adapter`, and the adapter must be a known workflow adapter (currently `code-review` or `discovery`). `validate` reports missing fields, unknown adapters and duplicate names; `inspect` lists the valid entries under `onboardedPlugins`. See the [workflow adapter architecture](docs/work-items/2026-11-15-workflow-adapter-architecture.md).

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
pnpm payloads:build     # generate host payloads into the git-ignored packages/adapter-*/payloads/
pnpm payloads:verify    # generate twice and compare: deterministic and valid for each host
pnpm release:assets     # build every plugin for every host and pack release-assets/ with SHA256SUMS
pnpm typecheck
pnpm test
```

## Quality gates

See [docs/quality-gates.md](docs/quality-gates.md) for the required local and CI checks (Linux, macOS, Windows).

## Translation plugin dogfood

See [docs/translation-plugin-dogfood.md](docs/translation-plugin-dogfood.md) for the M3 multi-Skill portable consumer and its intentional non-goals.

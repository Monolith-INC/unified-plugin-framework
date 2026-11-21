# Agent Plugins specification

UPF's plugin sources follow the [Agent Plugins specification](https://agent-plugins.org/specification), version 1.0.0. The specification defines a portable plugin: a folder that any compatible agent client can load. This page summarizes its architecture, shows where each part lives in UPF, and lists where UPF's implementation differs from it.

The specification is the authority. Where this summary and the published text disagree, the published text wins, and where the specification's JSON schemas disagree with its text, the text wins.

## How UPF uses it

The specification describes the source format only. It says how a client loads a plugin, not how a plugin reaches a particular host. UPF adds that second half:

```text
. (plugin.json + skills/)       portable root plugin, the format this page describes
        |
        v  packages/core        reads and validates the manifest, skills and MCP servers
        v  packages/compiler    turns them into one canonical model, plus UPF's own extension data
        v  packages/adapter-*   writes each host's native format (Claude Code, Codex, Cursor)
        |
release assets and transactional install (see architecture.md)
```

A host such as Claude Code does not read the portable format directly. It reads the payload that UPF's adapter generates for it, such as `.claude-plugin/plugin.json` and `.mcp.json`.

## Package layout

A plugin is one folder. `plugin.json` at its root is mandatory; every other part is found in a fixed place.

```text
my-plugin/
├── plugin.json                 manifest (required)
├── skills/<name>/SKILL.md      one folder per skill, with optional scripts/ and references/
├── mcp.json                    MCP server declarations
├── <namespace>/                files for one client extension, e.g. com.example.client/
├── LICENSE
└── CHANGELOG.md
```

Rules that apply to the whole package:

- **Containment.** Every path must resolve inside the plugin root, after symbolic links are followed. A link may exist only if it stays inside the root.
- **Relative paths.** A path in a configuration file starts with `./`.
- **Failure isolation.** A broken `plugin.json` rejects the whole plugin. A broken skill or MCP server entry is skipped on its own, and the rest of the plugin still loads.

## Manifest: `plugin.json`

The manifest has a closed set of top-level fields.

| Field | Required | Meaning |
| --- | --- | --- |
| `$schema` | Yes | The schema version. For 1.0.0 it is exactly `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. |
| `name` | Yes | 1 to 64 characters: lowercase letters, digits, `-` and `.`. Starts and ends with a letter or digit, with no `--` or `..`. |
| `version` | No | The plugin's version. It should follow SemVer. |
| `description` | No | A short description. |
| `author` | No | An object with only `name`, `email` and `url`, all strings. |
| `homepage` | No | A URL. |
| `repository` | No | A URL. |
| `license` | No | A license identifier. |
| `keywords` | No | A list of strings. |
| `extensions` | No | Client-specific data, keyed by namespace. |

Metadata fields are checked by JSON type only. How a client treats problems:

- An unknown top-level field is **reported and ignored**. It never rejects the plugin.
- Any other schema violation rejects the plugin. The client then discovers and runs none of its components.
- A client never fetches a schema over the network while loading a plugin.

## Components

Version 1.0.0 defines two component types. A client ignores component types it does not support.

### Skills

Every immediate child folder of `skills/` that holds a regular file named `SKILL.md` is one skill. Discovery does not go deeper. The skill format itself comes from the separate Agent Skills specification.

### MCP servers

MCP servers are declared in `mcp.json` at the plugin root, never inline in `plugin.json`.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "local": { "type": "stdio", "command": "node", "args": ["${PLUGIN_ROOT}/server.js"] },
    "remote": { "type": "streamable-http", "url": "https://mcp.example.com" }
  }
}
```

The file has exactly two top-level fields: `$schema`, which must match the manifest's specification version, and `mcpServers`. An empty `mcpServers` is valid. Each server is one of three variants.

| `type` | Required fields | Optional fields | Notes |
| --- | --- | --- | --- |
| `stdio` | `type`, `command` | `args`, `env`, `cwd` | `command` is one executable name or a `./` path, never a shell string. `cwd` starts with `./`, `${PLUGIN_ROOT}` or `${PLUGIN_DATA}`, and defaults to the plugin root. |
| `streamable-http` | `type`, `url` | `headers` | `url` is an absolute HTTP(S) URL with no user info or fragment. Any host other than loopback must use HTTPS. |
| `sse` | `type`, `url` | `headers` | The older HTTP+SSE transport from MCP 2024-11-05. Optional for clients. |

A client supports at least one of `stdio` and `streamable-http`, and should support both. It connects with the declared `type` and has no fallback. Failures stay local: an invalid `mcp.json` disables MCP for that plugin only, an invalid entry skips that server only, and a failed connection blocks nothing else. Version 1.0.0 has no OAuth or credential fields; authorization belongs to the client.

## Client extensions

Anything a single client needs beyond the two portable components goes in an extension, named by a reverse-domain namespace such as `com.example.client`.

- **Data** goes under that namespace in the manifest's `extensions` object. A client ignores namespaces it does not implement, without checking their contents. An `extensions` value that is not an object is reported but does not reject the plugin.
- **Files** go in a top-level folder named exactly after the namespace.

The specification gives extension data and folders no portable meaning.

## Placeholders and environment

Two placeholders exist:

- `${PLUGIN_ROOT}`: the absolute path of the plugin root.
- `${PLUGIN_DATA}`: a folder the client creates for each installed plugin. It survives updates and may be deleted on uninstall.

They are expanded only in a server's `args`, `env` values and `cwd`, in one pass, without recursion. They are never expanded in `url` or `headers`. The client sets `PLUGIN_ROOT` and `PLUGIN_DATA` in each subprocess environment after applying the configured `env`, so a plugin cannot override them, and `env` may not declare those two keys.

## Versioning

- The specification version covers the whole release, including both schemas. Each release publishes both schemas under the same version, and a schema identifier is never reused.
- A client decides whether it supports a plugin from the declared `$schema` values and any compatibility mappings it knows.
- A plugin's own `version` should follow SemVer. A client may use it for update checks and cache freshness.

## Client conformance

A client can adopt the specification incrementally; a client that only loads skills can still conform. A conformant client:

1. Loads a plugin from a folder.
2. Selects a supported `$schema` and validates `plugin.json` against it.
3. Ignores extension namespaces it does not implement.
4. Discovers each component type it supports from that type's fixed location.
5. Supports `stdio` or `streamable-http` if it supports MCP.
6. Provides and expands `PLUGIN_ROOT` and `PLUGIN_DATA` if it starts subprocesses.
7. Treats `command` as one token and defaults `cwd` to the plugin root.
8. Supports at least one component type.

The specification's Appendix A has the full checklist.

## Security

- **Containment is not a sandbox.** Keeping paths inside the plugin root says nothing about what a server process can do once it runs.
- **No secrets in the package.** `headers` and `env` are visible package data, so a plugin must not put credentials in them.
- **Transport.** Plain HTTP to any host other than loopback is not allowed. A client must not forward configured headers to another origin, through a redirect or an SSE endpoint event, unless the user allows it.
- **Header precedence.** Headers the client generates replace configured headers of the same name.

## Where each part lives in UPF

| Specification part | UPF code |
| --- | --- |
| Loading a plugin folder, containment | `loadPluginRoot`, `resolveContained` in `packages/core/src/index.ts` |
| Manifest validation | `inspectManifest` and `readManifest` in `packages/core/src/index.ts` |
| Skill discovery | `packages/core/src/index.ts` (immediate children of `skills/`) |
| `mcp.json` and server variants | `discoverMcpServers` and `readMcpServers` in `packages/core/src/index.ts` |
| Placeholders | `PluginPlaceholder` and `PLACEHOLDER_PATTERN` in `packages/core/src/index.ts` |
| Client extensions | `extensions` in the manifest. UPF uses `io.github.monolith-inc.upf` for onboarded plugins and `io.github.monolith-inc.upf.distribution` for rules and hook intents (`packages/compiler/src/index.ts`) |
| Mapping to native host formats | `packages/adapter-claude`, `packages/adapter-codex`, `packages/adapter-cursor` |
| Command-line check | `agent-plugin validate` |

## Remaining backwards-compatibility tolerances

UPF's plugin reader (`packages/core`) and all bundled plugins under `plugins/` conform to Agent Plugins v1.0.0. To avoid breaking older UPF/toolkit plugin sources during migration, the reader intentionally retains a few deprecated tolerances that emit warnings (never silent acceptance):

| Area | Specification (v1.0.0) | UPF compatibility behavior |
| --- | --- | --- |
| Legacy `schemaVersion` | `$schema` is required. | A manifest with `schemaVersion: "1.0.0"` and no `$schema` still loads with a `manifest.schema.legacy` warning naming `$schema`. |
| Legacy `@scope/name` | Lowercase `a-z`, `0-9`, `-`, `.` (1–64 chars). | Scoped `@scope/name` manifests still load with a `manifest.name.legacy_scope` warning. |
| Legacy `mcp.json` shapes | `$schema` + `mcpServers` wrapper and explicit `type`. | Bare server maps, omitted `type` (inferred `stdio`), `transport` alias, inline `mcpServers` in `plugin.json`, and `config-path` still load with `mcp.format.legacy` / `manifest.inline_components.legacy` warnings. |
| Legacy distribution namespace | Reverse-domain namespace controlled by the client. | `io.github.monolith-inc.upf.distribution` is primary; `org.agent-plugins.distribution` is still read as a fallback with a `manifest.extensions.legacy_namespace` warning. |
| Bundle compilation `version` | Optional in `plugin.json`. | Optional in `packages/core` (`agent-plugin validate`), required by `packages/compiler` when compiling Claude/Codex/Cursor host bundles (whose native manifests require SemVer). |
| `author.name` | Optional string inside `author`. | `isPluginAuthor` requires a non-empty `author.name` because Claude Code's validator rejects nameless authors. |

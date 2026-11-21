# Tooling bootstrap

One accepted setup plan coordinates the existing project service, transactional payload installer, knowledge runtime and host configuration. Invoke it explicitly, or when a required capability is missing. Ordinary skills use working adapters directly; bootstrap adds no periodic session scan or repeated setup interview.

Bootstrap sets up Codex, Claude Code, or both, chosen by the plan's `hosts` list. Existing plans with a single `host` still work. Bootstrap runs shared setup once and checks each selected host separately. Each host installs its own build of the framework plugins and uses the same pinned dependency sources. The host table and adapter packages define the configuration and discovery details.

| Host | Plugins | Project knowledge | Unnamespaced skills | Discovery check |
| --- | --- | --- | --- | --- |
| Codex | `.codex/config.toml` marketplace, `codex plugin add` | Standalone `monolithic-agent-knowledge-store` stdlib Python 3.12+ (zero MCP) | `.agents/skills` | Codex app server `skills/list` |
| Claude Code | a marketplace named for this project (`upf-<hash>`), declared and installed at local scope in `.claude/settings.local.json` | Standalone `monolithic-agent-knowledge-store` stdlib Python 3.12+ (zero MCP) | `.claude/skills` | `claude plugin list --json` |

Claude Code keeps known marketplaces per user, so each project's catalog has its own name and one project never repoints another's plugins. Project knowledge uses user-provided Python 3.12+ and stdlib scripts (`scripts/query.py`) with no MCP server or virtual environment.

Artifact tests exercise the distribution, both framework payloads for every setup host, and dependency staging on Linux; a real-project host trial remains a separate release gate. macOS qualification is deferred for this release. Use the complete release distribution for installation; a development source checkout remains supported. A bare host payload alone does not supply the CLI or dependency plugins.

## Interactive installation

The release's `install.sh` launcher starts a terminal wizard that creates the plan internally. Use arrows to move, Space to check a row, and Enter to confirm. **All** selects every row, and **a** toggles all. On terminals without raw input, enter the listed numbers. Review the summary and choose **Install** to apply it. [Installation guide](../vendor-payload-installation.md#complete-framework-installation)

## Prepare and accept one plan (automation or agent-driven setup)

Run `project describe` to reuse project choices. Collect missing tracker, language, and document choices through `project-bootstrap`. Confirm the selected hosts, any dependency sources the setup will fetch, and the isolated runtime before applying the plan.

## Dependency plugins come with the release

The complete distribution contains all six upstream repositories under `dependencies/<plugin>@<version>`, unchanged, including licenses, runtime adapters and references outside nested plugin folders. `distribution.json` records file and link digests; the framework manifest declares each source and `onboarded.lock.json` pins the workflow bindings. Bootstrap verifies included content and stages selected plugins locally. Missing or modified distribution content fails with `distribution-incomplete`; there is no plugin download fallback.

Only a development workspace may fetch dependencies: the release builder and development bootstrap use the source declarations and existing lock checks. The following fetch/cache details apply to that development path.

A source has the form `github:<owner>/<repo>[/<folder>][#<ref>]`. The pinned version maps to the git ref `v<version>`, unless the declaration names another ref, such as a commit whose content the lock pins. `<folder>` is the plugin's folder inside the repository; without it the plugin is the repository root. The declarations in `plugin.json` and the pins in `io.github.monolith-inc.upf/onboarded.lock.json` are the only record of what is fetched.

Each source is fetched as a shallow git checkout into a private directory and checked against the lock for every selected workflow it serves. Only a matching tree is kept, as `.upf-tools/sources/<plugin>@<version>`; later runs reuse it while it still matches, and fetch it again otherwise. A tree that differs from its pin fails with `dependency-fetch-mismatch`: the copy is discarded and nothing is staged. A failed fetch reports `dependency-fetch`. Until the sources are fetched, the `dependencies` capability reports as missing rather than misconfigured.

To use a local copy instead, give its root in `pluginRoots`, with the same `[plugin[@version]=]directory` syntax as `adapter-check`. An explicit root replaces fetching for that plugin and passes the same lock check.

Example structure (replace the illustrative choices with accepted project choices):

```json
{
  "hosts": ["codex", "claude"],
  "python": "python3.12",
  "workflows": ["project-tracking"],
  "pluginRoots": [],
  "consent": {
    "privatePython": false,
    "installHostClis": false,
    "headlessDiscovery": false
  },
  "knowledge": {
    "knowledgeRoot": "Project_Knowledge",
    "documentMode": "shared",
    "docsRoot": "docs",
    "vaultRoot": "docs"
  },
  "trackerRef": "<existing scoped work item>"
}
```

Optional `answers` contains accepted project setup answers, using the existing project settings shape. No tracker is selected by this example. Optional `steps` limits an explicit repair to named capabilities; omit it for the complete plan. The capability names are `settings`, `cli`, `skills`, `dependencies`, `knowledge-runtime`, `knowledge-settings`, `knowledge-content`, `knowledge-server`, `review`, `host-discovery`, `tracker`.

All consent flags default to `false`. Set `privatePython` to `true` only to let the release launcher download a pinned private runtime when it cannot find Python 3.12+. Set `headlessDiscovery` to `true` only to allow a model run that reads the project and writes to the accepted knowledge store. Setup attempts discovery after verifying the host and runtime. On Linux x64 and arm64, `installHostClis` allows setup to fetch a missing selected host's pinned native package from the npm registry and verify its checksum. The report prints the private executable path. Add its directory to PATH to launch it by name, or follow the reported manual recovery if setup cannot install it.

```sh
pnpm agent-plugin project bootstrap --input plan.json --project <target-project>
# After the user accepts the reported plan:
pnpm agent-plugin project bootstrap --input plan.json --apply --project <target-project>
```

Use `--resume request.json` for a saved neutral project request. Resume runs once in that invocation only when every selected capability has verification evidence. An incomplete report preserves the request and identifies its remaining recovery. After an uncertain work-item write, resolve its outcome before running the saved request again.

The bootstrap apply command and release launcher use `0` for completed selected checks, `2` for pending hand-offs or user actions, and `1` for a stop or preserved conflict. The release launcher accepts `--strict` to convert `2` to `1`. [CI example](../vendor-payload-installation.md#automation-and-local-files)

When the installer reports a hand-off, say **Use the project-bootstrap skill to finish setup** in a new agent session. The CLI verifies `.upf-tools/pending-tasks.json` against an installer receipt outside the checkout, under `$XDG_STATE_HOME/unified-plugin-framework/handoffs` or `~/.local/state/unified-plugin-framework/handoffs`. Use the same operating-system account and state location. The skill claims a task before working and records completion after verification.

## What setup owns

Project settings remain in `.unified-plugin-framework.json`; knowledge/document settings remain in `project-knowledge.json` (with legacy `.project-knowledge.json` read compatibility). CLI and staged host distributions live in `.upf-tools/`. Keep these machine-local paths out of commits according to the consuming project's policy.

The CLI wrapper uses the existing built framework entry point. Shipped framework payloads use the existing transactional installer. Bundled, fetched and explicit dependency source trees are copied unchanged to host wrappers, checked against exact pins and staged content; originals are never patched. Codex adapter metadata owns namespace/configuration details. Bare-skill dependencies are copied into the project's skill directory only when no unmanaged content conflicts. Existing host entries, project choices and review provider bindings are preserved; conflicts require reconciliation rather than replacement.

Project knowledge uses the staged `monolithic-agent-knowledge-store` stdlib Python 3.12+ scripts (`scripts/query.py`) with zero MCP and no virtual environment. If knowledge discovery remains pending, the bootstrap skill uses `knowledge-discover` to derive source-backed units. Configure missing review provider bindings through review-setup using saved project choices, then connect it to the same root.

Dependency wrappers are published only after a private staging copy is complete, so interruption does not leave a half-installed final wrapper. Existing unmanaged directories remain conflicts to resolve explicitly. Marketplace additions preserve earlier workflow entries and unrelated metadata. Active discovered skill directories are compared with the pinned staged source, including references; a matching name or version marker alone never establishes readiness.

Fresh Codex discovery verifies expected skill names separately from files on disk. It runs no model conversation. The current chat may need a reload before newly registered tools appear. The selected tracker adapter must complete a scoped read (an existing item when trackerRef is supplied, otherwise a search that may return no items); another client's login is insufficient evidence. Credentials stay in the supported adapter environment, never in the plan, project settings or chat.

Each successful step is retained. Re-entry observes working capabilities and configures only missing ones. Reports distinguish ready capabilities from user action, connection failures, unavailable executables and unsupported hosts. A connection failure preserves settings and never restarts the tracker interview.

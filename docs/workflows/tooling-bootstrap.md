# Tooling bootstrap

One accepted setup plan coordinates the existing project service, transactional payload installer, knowledge runtime and host configuration. Invoke it explicitly, or when a required capability is missing. Ordinary skills use working adapters directly; bootstrap adds no periodic session scan or repeated setup interview.

Artifact tests exercise the distribution and Codex staging on Linux; a real-project host trial remains a separate release gate. macOS qualification is deferred for this release. Other hosts retain their existing host-payload commands and receive an explicit unsupported-host recovery for full bootstrap. Use the complete release distribution for installation; a development source checkout remains supported. A bare host payload alone does not supply the CLI or dependency plugins.

## Interactive installation

The release's `install.sh` launcher starts a terminal wizard that collects these choices and creates the plan internally. It uses the same bootstrap described below, preserving saved project settings and reporting remaining setup actions. No user-written JSON is required for this interactive path. The launcher is added after v0.2.1; see the [installation guide](../vendor-payload-installation.md#complete-framework-installation) for release availability and automation.

## Prepare and accept one plan (automation or agent-driven setup)

Run `project describe` to reuse project choices. Collect only missing tracker/language/document choices through project-bootstrap. Download/install authorization applies to the concrete plan, including its selected host, the dependency sources it fetches and the isolated runtime.

## Dependency plugins come with the release

The complete distribution contains all five upstream repositories under `dependencies/<plugin>@<version>`, unchanged, including licenses, runtime adapters and references outside nested plugin folders. `distribution.json` records file and link digests; the framework manifest declares each source and `onboarded.lock.json` pins the workflow bindings. Bootstrap verifies included content and stages selected plugins locally. Missing or modified distribution content fails with `distribution-incomplete`; there is no plugin download fallback.

Only a development workspace may fetch dependencies: the release builder and development bootstrap use the source declarations and existing lock checks. The following fetch/cache details apply to that development path.

A source has the form `github:<owner>/<repo>[/<folder>][#<ref>]`. The pinned version maps to the git ref `v<version>`, unless the declaration names another ref, such as a commit whose content the lock pins. `<folder>` is the plugin's folder inside the repository; without it the plugin is the repository root. The declarations in `plugins/unified-plugin-framework/plugin.json` and the pins in its `onboarded.lock.json` are the only record of what is fetched.

Each source is fetched as a shallow git checkout into a private directory and checked against the lock for every selected workflow it serves. Only a matching tree is kept, as `.upf-tools/sources/<plugin>@<version>`; later runs reuse it while it still matches, and fetch it again otherwise. A tree that differs from its pin fails with `dependency-fetch-mismatch`: the copy is discarded and nothing is staged. A failed fetch reports `dependency-fetch`. Until the sources are fetched, the `dependencies` capability reports as missing rather than misconfigured.

To use a local copy instead, give its root in `pluginRoots`, with the same `[plugin[@version]=]directory` syntax as `adapter-check`. An explicit root replaces fetching for that plugin and passes the same lock check.

Example structure (replace the illustrative choices with accepted project choices):

```json
{
  "host": "codex",
  "python": "python3.12",
  "workflows": ["project-tracking"],
  "pluginRoots": [],
  "knowledge": {
    "knowledgeRoot": ".project-knowledge/knowledge",
    "documentMode": "shared",
    "docsRoot": "docs",
    "vaultRoot": "docs"
  },
  "trackerRef": "<existing scoped work item>"
}
```

Optional `answers` contains accepted project setup answers, using the existing project settings shape. No tracker is selected by this example. Optional `steps` limits an explicit repair to named capabilities; omit it for the complete plan. The capability names are `settings`, `cli`, `skills`, `dependencies`, `knowledge-runtime`, `knowledge-settings`, `knowledge-content`, `knowledge-server`, `review`, `host-discovery`, `tracker`.

```sh
pnpm agent-plugin project bootstrap --input plan.json --project <target-project>
# After the user accepts the reported plan:
pnpm agent-plugin project bootstrap --input plan.json --apply --project <target-project>
```

Use `--resume request.json` for a saved neutral project request. Resume runs once in that invocation only when every selected capability has verification evidence. An incomplete report preserves the request and identifies its remaining recovery. After an uncertain work-item write, resolve its outcome before running the saved request again.

## What setup owns

Project settings remain in `.unified-plugin-framework.json`; knowledge/document settings remain in `.project-knowledge.json`. The isolated Python environment is `.project-knowledge/runtime`; CLI and staged host distributions live in `.upf-tools/`. Keep these machine-local paths out of commits according to the consuming project's policy.

The CLI wrapper uses the existing built framework entry point. Shipped framework and knowledge payloads use the existing transactional installer. Bundled, fetched and explicit dependency source trees are copied unchanged to host wrappers, checked against exact pins and staged content; originals are never patched. Codex adapter metadata owns namespace/configuration details. Bare-skill dependencies are copied into the project's skill directory only when no unmanaged content conflicts. Existing host entries, project choices and review provider bindings are preserved; conflicts require reconciliation rather than replacement.

The knowledge runtime is installed from a private source copy into an isolated environment. It uses the runtime's own configuration selection and a fresh protocol client for catalog/search/fetch verification. Populate an empty store with discover-project-knowledge; bootstrap does not invent its content. Configure missing review provider bindings through review-setup using saved project choices, then connect it to the same root.

Dependency wrappers are published only after a private staging copy is complete, so interruption does not leave a half-installed final wrapper. Existing unmanaged directories remain conflicts to resolve explicitly. Marketplace additions preserve earlier workflow entries and unrelated metadata. Active discovered skill directories are compared with the pinned staged source, including references; a matching name or version marker alone never establishes readiness.

Fresh Codex discovery verifies expected skill names separately from files on disk. It runs no model conversation. The current chat may need a reload before newly registered tools appear. The selected tracker adapter must complete a scoped read (an existing item when trackerRef is supplied, otherwise a search that may return no items); another client's login is insufficient evidence. Credentials stay in the supported adapter environment, never in the plan, project settings or chat.

Each successful step is retained. Re-entry observes working capabilities and configures only missing ones. Reports distinguish ready capabilities from user action, connection failures, unavailable executables and unsupported hosts. A connection failure preserves settings and never restarts the tracker interview.

# Tooling bootstrap

One accepted setup plan coordinates the existing project service, transactional payload installer, knowledge runtime and host configuration. Invoke it explicitly, or when a required capability is missing. Ordinary skills use working adapters directly; bootstrap adds no periodic session scan or repeated setup interview.

The current automated host is Codex on Linux/macOS, from a built framework source checkout. Other hosts retain their existing installation commands and receive an explicit unsupported-host recovery. A bare host payload still requires the framework CLI; bootstrap does not download an unselected distribution.

## Prepare and accept one plan

Run `project describe` to reuse project choices. Collect only missing tracker/language/document choices through project-bootstrap. Obtain clean published roots matching the framework's dependency pins; use the same `[plugin[@version]=]directory` syntax as `adapter-check`. Download/install authorization applies to the concrete plan, including its selected host, source roots and isolated runtime.

Example structure (replace the illustrative choices with accepted project choices):

```json
{
  "host": "codex",
  "python": "python3.12",
  "workflows": ["project-tracking"],
  "pluginRoots": ["/absolute/published-toolkit-root"],
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

The CLI wrapper uses the existing built framework entry point. Shipped framework and knowledge payloads use the existing transactional installer. Dependency source trees are copied unchanged to host wrappers, checked against exact pins and staged content; originals are never patched. Codex adapter metadata owns namespace/configuration details. Bare-skill dependencies are copied into the project's skill directory only when no unmanaged content conflicts. Existing host entries, project choices and review provider bindings are preserved; conflicts require reconciliation rather than replacement.

The knowledge runtime is installed from a private source copy into an isolated environment. It uses the runtime's own configuration selection and a fresh protocol client for catalog/search/fetch verification. Populate an empty store with discover-project-knowledge; bootstrap does not invent its content. Configure missing review provider bindings through review-setup using saved project choices, then connect it to the same root.

Dependency wrappers are published only after a private staging copy is complete, so interruption does not leave a half-installed final wrapper. Existing unmanaged directories remain conflicts to resolve explicitly. Marketplace additions preserve earlier workflow entries and unrelated metadata. Active discovered skill directories are compared with the pinned staged source, including references; a matching name or version marker alone never establishes readiness.

Fresh Codex discovery verifies expected skill names separately from files on disk. It runs no model conversation. The current chat may need a reload before newly registered tools appear. The selected tracker adapter must read an existing scoped item; another client's login is insufficient evidence. Credentials stay in the supported adapter environment, never in the plan, project settings or chat.

Each successful step is retained. Re-entry observes working capabilities and configures only missing ones. Reports distinguish ready capabilities from user action, connection failures, unavailable executables and unsupported hosts. A connection failure preserves settings and never restarts the tracker interview.

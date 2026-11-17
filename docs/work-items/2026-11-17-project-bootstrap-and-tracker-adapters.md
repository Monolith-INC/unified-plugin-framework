# Project bootstrap and tracker adapters

Date: 2026-11-17

Implementation: [AGE-100](https://linear.app/agentical-monolithics/issue/AGE-100/project-bootstrap-and-tracker-adapters)
Status: Implementation approved; in progress on AGE-100, before AGE-98.

## User experience

A skill requests an operation through the project. When the configured adapter is available, the project uses it directly. When setup is missing or incomplete, the project runs bootstrap, asks for the missing choices, saves the accepted configuration and resumes the original request. Subsequent calls use the configured adapter.

This happens at the shared operation boundary. It needs no periodic scan, separate readiness flag, session-start requirement or setup check repeated inside each skill.

Bootstrap establishes:

- The tracker and the project-specific settings its adapter requires, such as the target team and project.
- The project's language, used for communication, documentation and other generated prose.
- Necessary document, planning and knowledge locations, reusing the existing knowledge setup and its authoritative configuration.

Existing choices become the proposed defaults. Ask only for missing or changed choices, explain recommended defaults briefly, and preserve unrelated settings. Completing setup returns to the request that caused it.

## Responsibilities

| Component | Owns |
| --- | --- |
| Project configuration | User-selected tracker, project-specific adapter settings, language and project locations |
| Bootstrap | Collecting and saving missing choices, configuring the adapter and resuming the request |
| Tracker adapter | Connection, supported operations, field/type/state mappings and conversion to explicit success or failure results |
| Workflow skills | The work to perform, using neutral project operations |

The shared work-item contract covers reading, searching, creating, updating, changing state and listing children, plus the artifact operations required by the workflows. Start with the operations the product actually needs. The selected adapter translates them into its provider's actions. A tracker change affects configuration and the adapter binding; workflow skills remain the same.

Tracker product names, native tool names and provider field conventions belong in setup choices and adapter implementations. Skills and their shared workflow instructions use the neutral contract. Registering neutral framework skills while delegating directly to provider-specific instructions would still leave the leak in place.

Missing configuration leads to bootstrap. An unavailable connection or unsupported action returns a specific recovery and preserves the request. Avoid restarting completed setup for the same runtime failure. After an uncertain write, establish its outcome before retrying so a retry does not duplicate a work item.

## Implementation

`packages/project` owns the neutral request model, settings refinement, bootstrap/resume service and tracker adapters. `agent-plugin project describe|setup|request` is the command boundary. Request bodies and accepted setup answers use JSON files, keeping prose out of shell interpolation.

The installed skills require the framework CLI alongside them. Source-checkout usage is `pnpm --dir <framework-checkout> agent-plugin project ...` after install/build. The host payload does not contain Node dependencies; missing-runtime recovery preserves the user's request and identifies that prerequisite instead of attempting bootstrap without an executable.

Project choices live in `.unified-plugin-framework.json`. An example for local tickets is:

```json
{
  "schemaVersion": 1,
  "language": "en",
  "artifactsPath": "docs/work-items",
  "tracker": { "adapter": "local", "values": {} }
}
```

This example is a proposed choice, not an automatic tracker selection. Local items and their versioned artifacts live in `.unified-plugin-framework/items.json`. Atomic writes and an exclusive file lock preserve existing records during overlapping writes. Settings updates also reject changes made since the bootstrap read.

The other initial adapter is `linear`. Its `values` require `team` and `project` UUIDs, resolved from the user's selected names through the connector during bootstrap. Optional `kind.<logical-kind>` and `state.<logical-state>` values map the project's labels and states. It uses the existing official MCP connector at `https://mcp.linear.app/mcp` through `@modelcontextprotocol/sdk` 1.32.2. An optional `connection` sets `url` and `tokenEnv`; the default credential variable is `LINEAR_API_KEY`. Credentials stay in the process environment. The adapter scopes reference-based operations to the saved team and project and does not retry uncertain writes. Additional trackers can implement the same project operation boundary; they are not advertised as shipped adapters.

The connector and protocol interfaces were checked against the [official Linear MCP documentation](https://linear.app/docs/mcp) and [TypeScript SDK v1 client documentation](https://ts.sdk.modelcontextprotocol.io/client). SDK main-branch v2 examples use a different package layout, so this implementation uses the pinned v1 API.

## Reference

Before AGE-100, Unified Plugin Framework registered code review and Discovery, with generated readiness instructions covering plugin availability and project knowledge. It had no project bootstrap command or tracker operation adapter. The separate `project-knowledge` plugin continues to own knowledge/document location setup.

Monolithic Dev Harness provides a useful reference at commit `bc08703ec55033f97bf8ac929de117b17423f2a5` in `/home/monolith/projects/monolithic-dev-harness`:

- `docs/01-architecture/decisions/ADR-0009-trackers-are-adapters.md`: project selection separated from tracker definitions.
- `plugins/monolithic-dev-harness/scripts/integrations/contracts.py`: immutable `TrackerOps` contract with explicit results.
- `plugins/monolithic-dev-harness/trackers/<name>/tracker.json` and `adapter.py`: provider settings, capabilities and translation together.
- `plugins/monolithic-dev-harness/scripts/harness/bootstrap.py`: inspecting existing choices, configuring missing settings and returning to work.
- `plugins/monolithic-dev-harness/tests/harness/test_tracker_neutral.py`: checking workflow instructions for provider leakage.

Use these responsibilities as the reference. The harness's workflow engine, enforcement policies, approval machinery and full sprint-planning surface are outside this change. Its checkout has unrelated uncommitted changes; this investigation changed none of them. Reuse must use a deliberate, supported integration boundary and preserve original dependency source files.

## Delivery and evidence

One implementation card owns the shared bootstrap, configuration and tracker adapter boundary. Keep configuration parsing and translation pure; inject filesystem and connector effects at the boundary. Exercise the same operation path with deterministic test interpreters and real adapters.

Focused checks should establish first-use setup and resumption, direct reuse of saved settings, the project language, adapter translation, preservation of existing choices and useful failure recovery. Check workflow instructions and their shared references for tracker leakage. Demonstrate one actual host operation after setup; static instruction tests alone do not prove that interaction.

Run the full repository checks once when the change is ready for publication, rebuilding payloads and updating their documented digests if affected. Apply the repository's single review pass for behavior changes. The repair agent remains the last delivery item.

## Product-flow guidance

The supplied `agile-product-user-flows.md`, `workflows-agile-product-discovery.md` and diagrams guide the later tracking work: find and resume existing artifacts, extract known facts before asking, fill gaps, retain source links and approvals, and resume downstream work when missing material arrives. They do not mandate their tracker services, page layouts, fixed document sequence or policy engine for this product. Small changes may start from an existing approved design without generating a full document set.

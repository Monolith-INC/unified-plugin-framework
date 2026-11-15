# Workflow adapter architecture

Date: 2026-11-15  
Status: Draft for owner review. Records the owner's design as stated on 2026-11-15, refined with the parts of the Unified Plugin Contract draft that support it. Open questions are marked.

## Summary

Unified Plugin Framework offers a set of workflows: elicitation, Discovery, planning, implementation and code review. The work behind them comes from outside plugins the framework onboards, such as Superpowers, BMad Method, Agile Backlog Toolkit, the Monolithic Code Review Toolkit and Agent Continuity.

Each workflow has a **workflow adapter**. The adapter is the contract the framework keeps with users and with the agents working for them: the skills and tools the workflow exposes. Internally, the adapter maps that contract onto whichever plugin currently does the work. The contract does not change because a plugin changes. To replace a plugin, pick the new one and adjust the adapter's internal mapping to it; the contract, and everything that uses it, stays the same. The adjustment is expected to be small.

Onboarded plugins are ordinary dependencies of the framework, handled the way a project handles entries in `package.json`: declared with a version, pinned, and upgraded only after checking that the new version still works with its adapter.

## Parts

| Part | What it is | Example |
| --- | --- | --- |
| Workflow | A user-facing activity the framework offers | Code review |
| Workflow adapter | The workflow's stable contract with users and agents, plus its internal mapping onto the plugin that currently does the work | The code review adapter, exposing `review-against-requirements` v1 |
| Onboarded plugin | An outside plugin the framework depends on | Monolithic Code Review Toolkit 1.x |
| Manifest | Declares the onboarded plugins, their versions, and which adapter each one serves | `plugin.json`, in a namespaced `extensions` entry |
| Lock | Records exactly what was installed, so a setup can be rebuilt | Plugin version, content checksum, adapter version |

## How a workflow uses a plugin

```text
User and agents
  │  use the workflow's skills and tools
  ▼
Workflow adapter
  ├─ contract: stable, owned by the framework
  └─ mapping: adjusted when the plugin changes
  │  calls only what the plugin publishes
  ▼
Onboarded plugin (unmodified, pinned version)
```

The contract is written in terms of what the workflow does, not which plugin does it. Code review offers "review code against requirements"; today the review toolkit supplies it. Only the adapter's mapping names the review toolkit, so the toolkit can be replaced without touching the contract.

## Workflow adapters

### What an adapter does

- Exposes the workflow's contract: the skills and tools users and agents rely on, each with a stable name and version.
- Maps each part of that contract onto something the current plugin publishes.
- Uses only the plugin's published surface: its skills, MCP tools and documented settings. It never reads the plugin's private files.
- Leaves the plugin's files as installed. Adapter code and configuration live in this repository.
- May set the plugin's own supported options, or add checks and reshape output around a call, inside the mapping.

### Two kinds of plugin offering

Plugins offer two different things, and the mapping handles them differently.

- **MCP tools** are callable operations with inputs and outputs. The mapping turns each contract operation into a tool call and converts the inputs and outputs. This part can be tested directly. The review toolkit and the knowledge plugin offer tools.
- **Skills** are written instructions the model follows. The mapping decides which plugin skill serves which workflow step, and may add framing instructions. The model chooses whether to follow a skill, so the adapter's instructions must sit inside the framework's own skills and tools. Superpowers, BMad Method and the Agile Backlog Toolkit mostly offer skills.

### Adapter tests

Each adapter has tests that check its contract is still fulfilled by the current plugin. These tests are the gate for upgrading or replacing a plugin.

## Plugins as dependencies

1. **Declare.** The manifest lists each onboarded plugin with a version range and its source.
2. **Pin.** Installation resolves one version per plugin and records it in the lock, with a content checksum and the adapter version.
3. **Upgrade.** When a plugin releases a new version, run its adapter's tests against the new version. Upgrade only if they pass; otherwise adjust the mapping first or stay on the pinned version.
4. **Replace.** To swap a plugin, add the new plugin, adjust the adapter's mapping to it, pass the adapter tests, then remove the old plugin. The adapter's contract stays the same.

Upgrades are deliberate. A newer release is not assumed to be safe.

## Versions

Three version numbers move independently:

| Version | Changes when | Example |
| --- | --- | --- |
| Plugin version | The plugin's author releases | Superpowers 5.0 → 5.1 |
| Adapter contract version | The framework deliberately changes what a workflow offers users and agents | `review-against-requirements` v1 → v2 |
| Manifest format version | The structure of the framework's manifest entry changes | `0.1.0` |

A plugin upgrade or replacement changes only the mapping, so it never forces a new contract version.

## Readiness

Each workflow reports whether it can run, and why not when it can't:

- **Declared:** the plugin is listed in the manifest.
- **Installed:** the pinned version is present.
- **Enabled:** the host has the plugin turned on.
- **Bound:** the adapter's mapping to the plugin passed its checks.
- **Ready:** the workflow can run.

For example: "Code review is unavailable: the review toolkit is installed but the code review adapter's checks failed."

## Relation to the inherited toolkit

The toolkit this repository forked already uses the same pattern in the other direction. Its **host adapters** (`packages/adapter-claude`, `adapter-codex`, `adapter-cursor`) take one portable plugin and translate it outward into each model host's format. Workflow adapters take an outside plugin and present it inward through a stable workflow contract.

| | Host adapter | Workflow adapter |
| --- | --- | --- |
| Direction | Our plugin → a model host | An onboarded plugin → our workflow |
| Stable side | The portable plugin | The adapter's contract with users and agents |
| Replaceable side | The host | The onboarded plugin |

The two keep distinct names in code and documentation. The manifest's `extensions` field, which the inherited core passes through without interpreting, holds the framework's dependency and adapter declarations while the manifest stays valid under the Agent Plugins schema.

## Initial workflow map

From the [core functionalities](unified-plugin-framework-core-functionalities.md):

| Workflow | Onboarded plugin | Main offering |
| --- | --- | --- |
| Discovery and planning | Superpowers, BMad Method | Skills |
| Project tracking | Agile Backlog Toolkit | Skills |
| Code review | Monolithic Code Review Toolkit | Skills and MCP tools |
| Continuity | Agent Continuity | Skills and hooks |
| Project knowledge (shared by all) | Project knowledge plugin | MCP tools |

The main offering column is an initial reading and needs confirming per plugin.

## Open questions

1. **Several plugins behind one adapter.** Discovery draws on Superpowers and BMad Method. Does each part of the contract map to one plugin, or can one part choose between plugins?
2. **Skill mapping in practice.** How does a workflow skill hand a step to an onboarded plugin's skill reliably, given that the model decides which skill to follow?
3. **Where adapters live.** One folder per workflow adapter in this repository?
4. **Contract format.** What defines each part of a contract: a name, a version and a description; or also input and output schemas for tool-based parts?
5. **Elicitation and implementation workflows.** Which plugins supply them? They are not yet in the core functionalities map.
6. **Which host comes first.** The first workflow should be proven on one named host before others.
7. **Naming.** Confirm "workflow adapter" and "host adapter" as the two terms.

## Sources

- [Unified Plugin Framework — draft plan](unified-plugin-framework-draft-plan.md)
- [Unified Plugin Framework — core functionalities](unified-plugin-framework-core-functionalities.md)
- [Unified Plugin Contract draft v0.1](../../Implementation_Plans/unified-plugin-contract-draft-v0.1.md), sections 3, 5.1, 5.4, 6, 7 and 8, for the capability, adapter, versioning, upgrade-check and readiness ideas used here
- [Toolkit architecture](../architecture.md) and [vendor payload installation](../vendor-payload-installation.md), for host adapters

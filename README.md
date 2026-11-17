# Unified Plugin Framework

Unified Plugin Framework (UPF) gives your coding agent a consistent set of workflows for shaping ideas, organizing work, implementing approved plans and reviewing the result. Project knowledge and session records help those workflows carry decisions and unfinished work forward.

UPF brings existing plugins together behind its own skills. You work through the framework; its workflow adapters connect those skills to the plugins that perform the work.

[Latest release](https://github.com/Monolith-INC/unified-plugin-framework/releases/latest) · [Installation guide](docs/vendor-payload-installation.md#complete-framework-installation) · [Workflow guide](docs/user-journey.md)

## What you can do

Start with the workflow that matches your task. You can bring an idea, a proposal, an existing design or work already in progress.

| Workflow | Use it to | Entry skills |
| --- | --- | --- |
| Discovery | Shape an idea into an approved design, with quick, thorough, comprehensive or research-led treatment. | `discover-quick`, `discover-thorough`, `discover-comprehensive`, `discover-research` |
| Project tracking | Turn an approved design into work items, refine their requirements and break them into implementable tasks. | `track-from-design`, `track-enrich`, `track-validate`, `track-breakdown` |
| Implementation | Execute or resume an authorized plan, then check the result against its acceptance criteria. | `implement-work`, `implement-verify` |
| Code review | Review a task, story or feature against its requirements and the project's recorded decisions. | `review-task`, `review-story`, `review-feature` |
| Continuity | Restore project context, save observed progress and recover usable context from readable records. | `continuity-continue`, `continuity-checkpoint`, `continuity-recover` |
| Project knowledge | Build and maintain a shared, source-backed record of the project for all workflows to consult. | `setup-project-knowledge`, `discover-project-knowledge` |

Discovery, tracking, implementation, review and continuity skills belong to `unified-plugin-framework`. The knowledge skills belong to the included `project-knowledge` plugin.

## Install in your project

The complete release contains the framework CLI, its production Node dependencies, the five workflow plugins and the project-knowledge runtime source. You do not need a framework development checkout, pnpm or separate plugin downloads to use that distribution.

### Requirements

- **Codex on Linux** for the complete automated setup verified with v0.2.1.
- **Node.js 22 or newer** and **Python 3.12 or newer** on your machine.
- **GitHub CLI (`gh`)** and network access to download the release. The knowledge runtime's isolated Python setup also installs packages from the package index.

Claude, Cursor and Codex each have individual host payloads in the release. Their availability does not mean complete setup is automated or qualified on every host and operating system. macOS qualification is deferred; see the [release notes](https://github.com/Monolith-INC/unified-plugin-framework/releases/tag/v0.2.1) for the verification scope.

### 1. Prepare your setup plan

The installer reads a JSON plan; it is not an interactive setup wizard. Use the [tooling setup guide](docs/workflows/tooling-bootstrap.md) to prepare `upf-plan.json` with your agent before running it.

Choose the workflows you need, the Python executable, and where project knowledge and documents will live. Reuse existing project settings, or supply the accepted tracker, language and planning-document choices described in the guide. Remote tracker verification also needs an existing work-item reference and the selected adapter's credentials.

Leave `pluginRoots` empty to use the plugins included in the release. The installed framework verifies those bundled sources against its dependency lock.

### 2. Run the release installer

From the root of the project where you want to use UPF:

```sh
gh release download v0.2.1 \
  --repo Monolith-INC/unified-plugin-framework \
  --pattern install.mjs \
  --output install.mjs

node install.mjs \
  --version 0.2.1 \
  --project "$PWD" \
  --input ./upf-plan.json
```

The installer downloads the complete archive, verifies its checksum and extracts it into a versioned directory under your project's `.upf-tools/`. It then runs the existing setup process to install the selected tooling and check its readiness. Keep that distribution available: the project CLI uses it.

For installation from downloaded local files, checksum and provenance details, or individual host payloads, use the [installation guide](docs/vendor-payload-installation.md).

### 3. Complete any reported setup actions

Read the setup report. Missing credentials, review-provider bindings, project knowledge content or host activation require the recovery action it names. The installer exits unsuccessfully while required setup remains incomplete and preserves completed steps so you can rerun the same plan.

Project knowledge must be derived from your repository and decisions; installation does not invent that content. Your current agent chat may also need a reload before newly installed skills and tools become available.

Once the CLI setup step is complete, inspect saved project choices with:

```sh
./.upf-tools/bin/agent-plugin project describe --project "$PWD"
```

## Work with your agent

Ask your agent to use the appropriate installed skill. For example:

> Use `unified-plugin-framework:discover-thorough` to turn this proposal into a design we can approve.

> Use `unified-plugin-framework:track-from-design` to organize the approved design into work items and implementation tasks.

> Use `unified-plugin-framework:implement-work` to continue the approved plan, then `unified-plugin-framework:implement-verify` to check the result.

> Use `unified-plugin-framework:review-story` to review this story against its requirements and our recorded project decisions.

> Use `unified-plugin-framework:continuity-checkpoint` to save the current progress and unfinished work.

The workflows use your project's saved tracker, language and document locations. Missing choices are handled through `project-bootstrap`. The current project-operation adapters support Linear and repository-local work items; remote credentials belong in the supported adapter environment, not in a setup plan or chat.

Continuity operations can be invoked explicitly. Installing their skills does not establish automatic capture of host events or automatic session management.

## What ships together

The complete archive includes these pinned dependencies as unchanged upstream repositories, with their supporting files and licenses:

| Plugin | Role in UPF |
| --- | --- |
| Superpowers | Discovery, implementation and verification guidance |
| BMad Method | Discovery, analysis and design methods |
| Agile Backlog Toolkit | Work-item preparation, validation and decomposition |
| Monolithic Code Review Toolkit | Requirements-grounded code review |
| Agent Continuity | Session orientation, progress records and recovery |

UPF also ships the independent `project-knowledge` plugin and its runtime. The framework's [dependency lock](plugins/unified-plugin-framework/onboarded.lock.json) records the exact plugin versions and the workflow mappings they were checked against. A dependency upgrade must pass the relevant adapter checks before it is accepted.

Installed releases use bundled dependencies locally. Missing or changed bundled content is reported as an error rather than silently fetching a replacement. Each release also provides checksums and signed build provenance.

## Documentation

- [Setup and recovery](docs/workflows/tooling-bootstrap.md)
- [Release installation and verification](docs/vendor-payload-installation.md)
- [Workflow guide](docs/user-journey.md)
- [Discovery](docs/workflows/discovery.md)
- [Project tracking](docs/workflows/project-tracking.md)
- [Implementation](docs/workflows/implementation.md)
- [Code review](docs/workflows/code-review.md)
- [Continuity](docs/workflows/continuity.md)
- [Shared project knowledge](docs/knowledge/README.md)
- [Workflow adapter architecture](docs/adr/ADR-001-workflow-adapter-interface.md)

## Develop UPF

To change the framework itself, clone this repository and use Node.js 22+ with pnpm 10.14.0:

```sh
git clone https://github.com/Monolith-INC/unified-plugin-framework.git
cd unified-plugin-framework
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm payloads:verify
```

Read [AGENTS.md](AGENTS.md) for repository rules and [the architecture guide](docs/architecture.md) for implementation boundaries. Release packaging and artifact checks are documented in the [installation guide](docs/vendor-payload-installation.md#building-and-checking-the-complete-distribution).

## License and origins

UPF is licensed under [Apache License 2.0](LICENSE). It is a fork of [Agent Plugins Toolkit](https://github.com/Monolith-INC/agent-plugins-toolkit); see [NOTICE](NOTICE) and the [upstream baseline](docs/upstream/baseline.md) for attribution and history. Bundled plugins retain their respective licenses.

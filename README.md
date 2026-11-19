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

### One command

Run this in a terminal from the project where you want to use UPF:

```sh
bash <(curl -fsSL https://github.com/Monolith-INC/unified-plugin-framework/releases/latest/download/install.sh)
```

The interactive installer will:

1. Confirm your project folder, using the current directory as its default.
2. Let you select Codex, Claude Code, or both, and choose your workflows. Only hosts found on your PATH start checked.
3. Reuse existing project settings and ask for missing tracker, language and document locations.
4. Show what setup will install, what it may back up, and whether you allowed headless discovery. The final selection starts on **Cancel**.
5. Install the verified distribution, run shared setup once, and verify each selected host separately.

Use **↑/↓** to move, **Space** to check a row, and **Enter** to confirm at least one selection. The **All** row selects every item, and **a** toggles all. Terminals without raw keyboard input show numbered choices. **Ctrl+C** or **Ctrl+D** cancels.

The installer creates its setup plan internally. The release bundles all five dependency plugins.

**Release availability:** interactive installation starts with v0.2.2, whose release assets include `install.sh`. v0.2.1 provides the earlier `install.mjs` plan-file entry point. See [releases](https://github.com/Monolith-INC/unified-plugin-framework/releases) for available files.

### Requirements and current support

- **Linux**, with **Codex**, **Claude Code**, or both.
  - Codex: plugins register through `.codex/config.toml` and `codex plugin add`.
  - Claude Code: plugins come from a marketplace named for this project and install at local scope (`.claude/settings.local.json`), and the knowledge server is registered at local scope too (`claude mcp add-json --scope local`), so this machine's paths stay out of shared files and Claude Code needs no approval prompt for it.
- **Bash**, **curl**, **Node.js 22+** and **Python 3.12+**. If Python is unavailable, the launcher can download a pinned private Python after you consent.
- Network access to GitHub Releases, the Python package index for isolated knowledge setup, and the npm registry if you authorize installation of a missing host CLI.
- Credentials for your chosen tracker connection. The installer reads supported environment credentials; it does not ask you to put secrets in a plan or chat.

The supported project trackers are repository-local files and Linear. For a new Linear setup, enter the team and project names or URLs; the connector resolves their identifiers. Your existing choices are reused on subsequent runs.

Individual payloads are also published for Claude, Cursor and Codex. Their availability does not mean complete setup is automated on every host and operating system. macOS qualification remains deferred.

### After installation

Read the report for each host and for shared setup. The installer exits `0` when the selected checks pass, `2` when hand-offs or user actions remain, and `1` when setup stops or preserves a conflicting file. `--strict` converts `2` to `1`. Rerunning setup reuses completed steps.

If the report lists a hand-off, open a session in a selected host and say **Use the project-bootstrap skill to finish setup**. Headless discovery runs only with consent and derives knowledge from repository evidence. Restart the host session when the report calls for a reload.

The project CLI lives under `.upf-tools/`:

```sh
./.upf-tools/bin/agent-plugin project describe --project "$PWD"
```

For a pinned release, set `UPF_VERSION` in the environment before running the installer. For unattended setup, pass an accepted plan with `--input`. The installation guide includes a CI example that handles exit `2` explicitly. [CI example and local archives](docs/vendor-payload-installation.md#automation-and-local-files)

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

To change the framework itself, clone this repository and use Node.js 22+ with pnpm 10.14.0. `pnpm payloads:verify` also needs the Claude Code CLI (`claude`), because it runs Claude Code's own validator on the Claude payloads; CI uses version 2.1.318.

```sh
git clone https://github.com/Monolith-INC/unified-plugin-framework.git
cd unified-plugin-framework
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm payloads:verify
```

Try your changes in a separate test project, never in this repository. An installed copy here would make sessions load the frozen installed skills instead of the editable ones in `plugins/`, so the installer refuses a UPF source checkout. To try a plugin change, install it into the test project, for example with `agent-plugin install --source plugins/<plugin> --vendor claude --target <test project>`, or run the release installer there.

Read [AGENTS.md](AGENTS.md) for repository rules and [the architecture guide](docs/architecture.md) for implementation boundaries. Release packaging and artifact checks are documented in the [installation guide](docs/vendor-payload-installation.md#building-and-checking-the-complete-distribution).

## License and origins

UPF is licensed under [Apache License 2.0](LICENSE). It is a fork of [Agent Plugins Toolkit](https://github.com/Monolith-INC/agent-plugins-toolkit); see [NOTICE](NOTICE) and the [upstream baseline](docs/upstream/baseline.md) for attribution and history. Bundled plugins retain their respective licenses.

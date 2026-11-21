# Spec-Driven Zero-CLI Installer & Agent Plugins v1.0.0 Conformance

## Context

Live installations of `v0.4.1` and `v0.4.2` exposed structural fragility in shelling out to host CLIs (`codex plugin add`, `codex app-server`, `claude plugin marketplace add`, `claude plugin install`) during project setup:

- Fresh directories are untrusted by Codex, so `.codex/config.toml` local marketplaces are ignored and `codex plugin add` fails.
- Calling host CLIs during install breaks when a host CLI is missing, unauthenticated, quota-exhausted, or changes CLI flags between releases.
- Host plugin commands mutate global user directories (`~/.codex/`, `~/.claude/`), creating cross-project cache drift.
- Distributions previously copied raw unrendered template `skills/` (`{{generated}}`, `{{readiness}}`, `{{delegate}}`) alongside `plugin.json`.

## Preserved Fallback (`v0.4.3` Marketplace Patch)

If a rollback to the host-CLI local-marketplace installer is ever needed, the verified `v0.4.3` fallback consists of:

1. **Codex untrusted-marketplace override:** Pass `-c marketplaces.upf-project.source_type="local" -c marketplaces.upf-project.source="<tools>"` in `CODEX_TOOLING.install(name, marketplace)` (`packages/adapter-codex/src/tooling.ts`, wired from `packages/cli/src/host-table.ts`). Verified live against `codex-cli 0.171.0` on an untrusted fresh directory (`skills`, `dependencies`, `knowledge-server`, `host-discovery` all `ready`).
2. **Interactive wizard fixes:** `Space` on row 0 (`All`) toggles all/none in `packages/cli/scripts/installer-picker.mjs`; `headlessDiscovery` defaults to `true` without an extra prompt in `packages/cli/scripts/installer-wizard.mjs`.
3. **Diagnostics:** Bounded 4 KiB stderr capture in `packages/cli/src/tooling-process.ts` and surfaced failure reasons in `packages/cli/src/tooling-acquisition.ts`.
4. **BMad agent personas & MAKS hooks:** 5 `bmad-agent-*` persona skills in `packages/workflows/src/discovery.ts` (re-pinned in `io.github.monolith-inc.upf/onboarded.lock.json`), `.upf-tools/bin/maks` launcher + `.codex/hooks.json` / `.claude/settings.local.json` MAKS hooks + configured `docsRoot`/`vaultRoot` directory creation in `packages/cli/src/tooling-runtime.ts`.

All items (2), (3), and (4) are retained directly in the spec-driven installer below.

## Architecture: Spec-Driven Zero-CLI Installer

### 1. Deterministic Project-Local Materialization (Zero Host CLI Calls)

Installing UPF into a project never invokes `codex plugin`, `codex app-server`, `claude plugin`, or `claude mcp`. Instead, each host adapter defines its pinned project-local specification contract:

- **Codex (`codex-plugins-2026-08-10`):**
  - Skills: `.agents/skills/<skill-name>/SKILL.md` (with sibling `scripts/`, `references/`, `assets/` and `.upf-source` ownership markers)
  - Config: `.codex/config.toml` (preserved; never requires global `~/.codex/` changes)
  - Hooks: `.codex/hooks.json` (MAKS `SessionStart`, `UserPromptSubmit`, `PreToolUse` merged non-destructively)
- **Claude Code (`claude-code-plugins-2026-08-10`):**
  - Skills: `.claude/skills/<skill-name>/SKILL.md` (with sibling files and `.upf-source` ownership markers)
  - Hooks: `.claude/settings.local.json` (MAKS `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop` merged non-destructively)
- **Shared project runtime:**
  - `.upf-tools/bin/agent-plugin` and `.upf-tools/bin/maks`
  - `_bmad/` runtime initialized when `discovery` is selected
  - `project-knowledge.json`, `Project_Knowledge/` support scaffolds (`manifest.md`, `QUERY_GUIDE.md`, `glossary.md`), and configured `docsRoot`/`vaultRoot` directories
- **Collision-free Agent Skills naming:**
  - All skills use valid Agent Skills v1.0.0 kebab-case names (`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`, 1–64 chars, no colons).
  - Non-colliding dependency skills keep their exact upstream directory and frontmatter name; skills colliding with a framework contract operation (`monolithic-code-review-toolkit`'s `review-task` and `review-feature`) materialize as `<plugin>-<skill>` with frontmatter `name:` aligned in the host copy while keeping `.upf-tools/plugins/<plugin>/source/` unmodified.

### 2. Recorded Host Specification Versions

Bootstrap writes `.agent-plugins/host-specs.json` recording:
- `schemaVersion`: `1`
- `agentPluginsSpec`: `"1.0.0"`
- Per-host `adapterVersion`, `vendorSchemaVersion`, `skillsDir`, `hooksFile`, and official spec `sources` from `packages/adapter-*/schema/evidence.json`.

`host-discovery` verifies `.agent-plugins/host-specs.json`, every materialized framework and dependency skill's content digest, Agent Skills frontmatter validity, and required runtimes deterministically on disk.

### 3. Optional Headless Knowledge Discovery

Only headless knowledge discovery (`knowledge-content`) invokes an LLM CLI when one is available on `PATH` and authenticated. If no host CLI is installed, signed in, or has remaining quota, installation still completes and cleanly hands off `knowledge-discovery` to `project-bootstrap`.

### 4. Agent Plugins v1.0.0 Conformance & Distribution Integrity

- `packages/core/src/index.ts` (`loadPluginRoot`) enforces **manifest-first rejection**: any missing, unreadable, escaping, or fatally invalid `plugin.json` rejects the entire plugin and returns no `skills` or `mcpServers`.
- `packages/cli/scripts/release-distribution.mjs` pre-assembles `skills/` and stamps `plugin.json` with the release version so `.upf-tools/distributions/<version>/` is itself a directly loadable Agent Plugins v1.0.0 plugin with zero raw `{{...}}` placeholders.

### 5. CI Conformance & Official-Source Drift Verification

- `pnpm specs:verify` (runs on every PR in `.github/workflows/ci.yml`): verifies adapter `evidence.json` matches exported `*_SCHEMA_VERSION` / `*_SCHEMA_EVIDENCE` constants, validates Agent Plugins v1.0.0 manifest-first conformance, and verifies deterministic zero-CLI materialization produces valid host trees.
- `pnpm specs:check-upstream` (runs on schedule + manual dispatch in `.github/workflows/spec-check.yml`): checks official `agent-plugins.org` schema URLs and host spec evidence URLs for availability/drift and verifies live host CLI discovery in CI.

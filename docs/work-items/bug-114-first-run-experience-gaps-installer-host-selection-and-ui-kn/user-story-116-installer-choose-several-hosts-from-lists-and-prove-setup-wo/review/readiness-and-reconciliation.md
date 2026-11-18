# Readiness, input reconciliation, risks, assumptions, technical choices and source preservation

Reviewed against the hardened approach (after the three lenses in `hardening-review.md`).

## Readiness (READY FOR DEVELOPMENT)

| Check | Result |
|---|---|
| Actionable | Each of the 10 tasks names its file(s) and the change. |
| Logical | Ordered by dependency: plan shape → loop → report → installer → release files → pickers → wizard → tests → docs. |
| Testable | ACs 1–9 are Given/When/Then; each matrix row names its test file. |
| Complete | No placeholders or TBDs. |
| Sufficient | Gap found: AGE-116's DoD asks for "acceptance criteria verified in a fresh test project"; the manual check uses "a temporary project". **Patch:** manual check names a fresh project created for the check. |
| Coherent | Gap found: Intent says host steps run "per host" while Task 2 says later hosts run `HOST_STEPS ∩ plan.steps` — consistent (the first host also runs host steps). No contradiction. |

## Input reconciliation (AGE-116 ticket → approach)

| Ticket item | Approach |
|---|---|
| Scenario 1, several hosts, "all" | AC 1, AC 3 |
| Scenario 2, checklists, lists, summary | AC 3, Tasks 7–8 |
| Scenario 3, valid example, help and parser agree | AC 4; Task 1 (per-field messages) and Task 8 (prompt table) |
| Scenario 4, flags or environment variables | AC 6 via `--input`. **Difference:** no environment variables; `--input` is the existing automation flag. Recorded as a decision in the memlog. |
| Scenario 5, not success while store empty or server silent; fills or names next action | AC 5; installer names the next action (filling is AGE-115) |
| DoD: several-host and non-interactive tests | Task 9 |
| DoD: README updated | Task 10 |
| Ticket "Current state" says AGE-110 supports Cursor | **Wrong:** only Codex and Claude Code are setup hosts. Refinement must correct AGE-116 and the delivery plan. |

## Risks

| Risk | Mitigation in the approach |
|---|---|
| Terminal left in raw mode | Task 7 restore paths; AC 8; fake-TTY tests |
| Every fresh install exits 2, surprising automation | Owner decision; documented in Task 10; stdout `status` |
| New modules missing from releases | Task 5 allowlist; Task 6 imports them from the archive |
| CLI output consumers break | Existing keys kept (Task 2) |
| Large pull request | Owner kept one Story; tasks 1–6 land first and are reviewable alone |

## Assumptions

| Assumption | Basis |
|---|---|
| Hosts do not overwrite each other's files | Source: per-host `frameworkDir`, `bareSkills`, manifests, server registration |
| Host CLI presence can be detected on PATH without running the host | `command -v`-style lookup through an injected capability; no host process started |
| `--input` counts as "flags" for Scenario 4 | It is the documented automation flag |
| Older installers read `host` from saved plans | Source: `parseBootstrap` requires `host` today; Task 1 keeps writing it |

## Technical choices

| Choice | Alternatives | Why |
|---|---|---|
| Node `readline` keypress pickers | A terminal-UI package | No new dependency to bundle in releases; small pure reducers |
| Loop the lifecycle per host | Per-host steps in the shared model; installer spawning per host | Least code; keeps `--input` working for several hosts |
| Exit code 2 for not ready | Exit 0 + message; exit 1 | Owner decision; CI can tell it from failure |

## Source preservation

The approach changes only framework-owned files under `packages/cli`, `scripts`, `plugins/unified-plugin-framework` and `docs`. It does not touch pinned workflow dependency sources (staged under `.upf-tools/`), vendored BMad files or `packages/project/src/tooling.ts`. Saved project settings and deselected hosts' configuration are preserved (Boundaries). No finding.

## Second pass: recovery-first approach (after the owner's "every path recovers" direction)

### Readiness

| Check | Result |
|---|---|
| Actionable | 13 tasks, each with files and change. |
| Logical | Plan shape → recovery table → loop → per-step recoveries → log → report → installer → release files → pickers → wizard → hand-off skill → tests → docs. |
| Testable | 11 ACs in Given/When/Then or explicit rules; each recovery row and chaos scenario becomes a named test (Task 12). |
| Complete | No placeholders. Pinned `uv` version and checksums are named as release data, chosen during implementation from the current `uv` release. |
| Coherent | The earlier "Never fill the knowledge store from the installer" is replaced by consented headless discovery or hand-off, per the owner's direction; no remaining contradiction. |

### Input reconciliation (changes since the first pass)

| Item | Approach |
|---|---|
| Owner: install what is missing | Private Python (`uv`), host CLIs in a user prefix, retried downloads |
| Owner: trigger setup | Recovery table Auto rows; conflict backup + replace |
| Owner: trigger data acquisition | Consented headless discovery, else hand-off |
| Owner: inform only when irrecoverable, with instruction | Stop class limited to the listed cases; AC 3 |
| Owner: log locally | `install-log.ts`, `project status` |
| AGE-116 Scenario 5 | Now satisfied by acquiring data rather than only naming the action |
| Overlap with AGE-115 | AGE-116 writes hand-offs and `project-bootstrap` runs them; AGE-115 makes it automatic at session start and owns the first-session BMad and continuity work. Refinement must note this in both tickets. |

### Risks (new)

| Risk | Mitigation |
|---|---|
| Story size grew substantially | Owner kept one Story; tasks 1–8 are reviewable before the picker work |
| Installing software on the user's machine | Listed in the summary before the single confirmation; user prefix only; never `sudo`; pinned and verified binaries |
| Headless agent cost and reach | Consent in the summary; knowledge tools only; bounded time |

### Assumptions (new)

| Assumption | Basis / check during implementation |
|---|---|
| `uv python install` gives a usable private Python 3.12 | `uv` is present on this machine (`/snap/bin/uv`); implementation pins a version and verifies |
| Host CLIs install without root into a user prefix | Both publish npm packages; verify the exact package names during implementation |
| A host CLI can run discovery headless with limited tools | Claude Code `-p` with allowed tools; Codex `exec`; verify flags during implementation |

### Technical choices (new)

| Choice | Alternatives | Why |
|---|---|---|
| Recovery as a data table | Per-step ad-hoc handling | One outcome per failure code, testable by iteration |
| JSONL log | Plain text | One record per event, machine-readable for `project status` |
| Hand-off file read by an existing skill | Wait for AGE-115 | Works now; AGE-115 automates it later |

### Source preservation

Still only framework-owned files. Host config files are edited only in framework-owned entries, after a backup. No finding.

### Assumption checks run on 2026-11-18

- Claude Code supports headless runs (`-p/--print`) with `--allowedTools` / `--disallowedTools`, so discovery can be limited to the knowledge server's tools.
- Codex supports `codex exec` with `--sandbox` and `-c` overrides; tool limiting is by sandbox policy rather than a tool allowlist, so Codex headless discovery runs read-only in the sandbox and writes only through the knowledge server.
- Host CLI packages exist on npm: `@anthropic-ai/claude-code`, `@openai/codex`.

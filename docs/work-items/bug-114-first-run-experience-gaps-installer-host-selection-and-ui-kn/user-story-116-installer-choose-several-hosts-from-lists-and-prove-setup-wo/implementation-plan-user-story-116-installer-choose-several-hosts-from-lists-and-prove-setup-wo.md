---
type: implementation-plan
feature: AGE-114
story: AGE-116
source_digest: bef658e9a1539d91de1f97d241b8841b626bc0c324a4b1a1b92e7a25da645166
skill: generate-breakdown-work-items
language: en
status: active
created: 2026-11-18
---

# Implementation Plan for "Installer: choose several hosts from lists and recover from every setup failure"

## Context

AGE-114 found that a first install leaves projects half set up: one host per run, free-text prompts, and setup that stops or claims success with an empty knowledge store. AGE-116 makes one run set up Codex and Claude Code from keyboard lists, recover from every setup failure, and stop only for truly unrecoverable ones, with an exact instruction and a local log. The approved approach (`approach-user-story-116-…md`, same folder) holds the recovery table, boundaries and edge cases; this plan orders the work into commits.

## Acceptance criteria coverage

1. **"Set up and verify each picked host separately, reporting shared steps once."** → Steps 1, 5.
2. **"Keep setting up the other host when one fails."** → Step 5.
3. **"Apply the documented recovery for every failure code and log it."** → Steps 2, 3, 4, 6.
4. **"Show the cause, exact instruction and log path for every stop."** → Steps 6, 7.
5. **"Collect project knowledge after setup, or write a hand-off naming the exact sentence to use."** → Steps 5, 12.
6. **"Ask consent before any download, install or headless run."** → Steps 1, 8, 11.
7. **"Leave the project unchanged when the user declines or cancels."** → Steps 8, 10.
8. **"Continue after a killed run without repeating finished steps or questions."** → Steps 3, 8.
9. **"Restore the terminal after cancelling inside a list."** → Step 10.
10. **"Accept `--input` with several hosts and read saved single-host plans."** → Steps 1, 9.
11. **"Return exit codes 0, 2 and 1 as described."** → Steps 7, 8.

## Delivery steps

Each step is one commit with its own tests (JavaScript, type checking off, concurrency 1).

1. **Plan shape** — `packages/cli/src/tooling-input.ts`: per-field `parseBootstrap` railway; `AcceptedPlan` with `hosts`, `workflows`, `consent`; legacy `host`; `forHost`; `host-required` guard; plan file keeps `host`. Tests: invalid hosts/workflows, legacy plan, consent defaults.
2. **Recovery table** — new `packages/cli/src/tooling-recovery.ts`: `RECOVERY` (class, exit, action, `onFailure`, attempt cap), `PINS`, headless argv per host, task-kind enum. Tests: every row's exit code; every emitted failure code has an entry.
3. **Safe files and resume** — `tooling-files.ts`, `tooling-node.ts`, `tooling-host.ts`, `tooling-runtime.ts`: distinct failure codes and Preserve class; per-file locks with stale takeover; start-of-run sweep; in-progress markers with installer-created paths; ownership ledger; verified 0600 backups; completion-marker readiness. Tests: kill-then-rerun per lock and marker; user files survive cleanup.
4. **Bounded processes** — `tooling-process.ts`: process-group kill with escalation, timer settle, capped output, timeout parameters, scrubbed environment. Tests: hung child, ignored SIGTERM, grandchild holding pipes.
5. **Several hosts and recovery loop** — `tooling-command.ts`: `HOST_STEPS`, pure `bootstrapHosts`, recovery with caps, failed host does not stop others, acquisition post-pass, `all-ready` monoid, output keys kept plus `project`, `hosts`, `handoffs`, `log`, `status`; resume once. Tests: recording IO for two hosts, failing first host, restricted steps, later-host dependencies, resume once, monoid laws.
6. **Local log** — new `install-log.ts` and `agent-plugin project status`: structured JSONL, redaction, 0600/0700, retention, `mkdtemp` fallback, never throws. Tests: fake secret redacted, unwritable folder.
7. **Final report** — new `packages/cli/scripts/install-report.mjs`: `finishInstall` with class-derived exits, host labels, backups, login commands, hand-off sentence, control characters stripped. Tests: table over (step, code), real `runTooling` output.
8. **Launcher** — `scripts/install.sh`, `scripts/install-release.mjs`: verify `install.mjs`; pure `main`; classified retries; launcher consent then pinned `uv`/Python; launcher logger; imports before apply; project lock and logs only after confirmation; async apply with progress; `--strict`; Git local exclude. Tests: spawn-level exit codes, declining leaves tree byte-identical, lock wait and takeover, updated launcher test.
9. **Release files** — `release-distribution.mjs`, `check-distribution.mjs`: allowlist new modules; check via `parseBootstrap` + `forHost`, both hosts and a legacy plan.
10. **Pickers** — new `packages/cli/scripts/installer-picker.mjs`: pure reducers; terminal boundary with readline hand-over, queued-key drop, raw-mode restore, Ctrl-C/Ctrl-D/EOF/SIGHUP; numbered fallback; ASCII glyphs. Tests: reducers, fake-TTY boundary.
11. **Wizard** — `installer-wizard.mjs`: `check`/`select`, PATH preselection, prompt table, read-only plan pass feeding the summary with consents, "Not changing". Tests: rejection messages, preselection, cancel.
12. **Hand-off skill** — `plugins/unified-plugin-framework/skills/project-bootstrap/SKILL.md`: run known task kinds after verifying the receipt, claim with compare-and-write, skip ready tasks. Test: planted file ignored.
13. **Docs** — README, CHANGELOG, `tooling-bootstrap.md`, `vendor-payload-installation.md`.

## Checks

Per step: build the touched package with `tsc -b --noCheck` and run its tests. Once at the end: the full suite with types off (`~/.claude/scripts/suite-without-types.mjs`), plus `pnpm payloads:verify`, then the manual check in a fresh test project (approach § Verification).

## Defaults note

Staging, Review and Breakdown Tasks are added when the plan is split into Tasks.

---
title: 'Installer: choose several hosts from lists and prove setup worked'
type: 'approach'
ticket: 'AGE-116'
created: '2026-11-18'
status: 'active'
route: 'full'
route_source: 'pinned'
review: ''
review_source: ''
lenses_ran: ['adversarial', 'edge-case-hunter', 'verification-gap']
review_loop_iteration: 2
context:
  - '{project-root}/docs/work-items/2026-11-17-age-108-interactive-installation.md'
  - '{project-root}/docs/work-items/bug-114-first-run-experience-gaps-installer-host-selection-and-ui-kn/user-story-116-installer-choose-several-hosts-from-lists-and-prove-setup-wo/elicitation/05-few-shot-exemplars.md'
  - '{project-root}/docs/work-items/bug-114-first-run-experience-gaps-installer-host-selection-and-ui-kn/user-story-116-installer-choose-several-hosts-from-lists-and-prove-setup-wo/elicitation/06-failure-mode-analysis.md'
  - '{project-root}/docs/work-items/bug-114-first-run-experience-gaps-installer-host-selection-and-ui-kn/user-story-116-installer-choose-several-hosts-from-lists-and-prove-setup-wo/review/hardening-review.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The installer sets up one host per run, asks every question as free text, stops on most failures with a "reconcile and rerun" message, and ends with "Installation finished" even when the knowledge store is empty.

**Approach:** The accepted plan holds a list of hosts; the existing lifecycle runs host-neutral steps once and host steps per host. Every failure has a recovery: what is missing is installed, what needs setup is set up, what needs data starts collecting it (headless, or handed to the first session). Only truly unrecoverable failures, or protections that must not be overridden, reach the user, with an exact instruction; every failure and recovery is logged locally. Keyboard pickers replace free-text choices; `--input` stays the automation path.

## Boundaries & Constraints

**Always:** Reuse `bootstrapTooling`, the host table and `--input`. Consent before any download, install or headless run: a one-line launcher consent for private Python, then one summary confirmation listing installs, likely backups and headless discovery; under `--input`, plan `consent` booleans (default false). Nothing is written to the project before confirmation (declining leaves it byte-identical). Host-neutral steps run once; reruns resume where the last run stopped. Every binary and package is pinned and checksum- or integrity-verified, including `install.mjs`. Installs go to the project or a user-owned prefix, with scrubbed environment. Only framework-owned config entries (recorded in an ownership ledger) are replaced, after a verified 0600 backup; Claude state changes go through the `claude` CLI. Every spawned process is time-bounded with process-group kill. Logs hold structured metadata only, redacted, 0600; logging never fails the install. `.upf-tools/` and `.project-knowledge/` are added to Git's local exclude. Saved plans with only `host` keep working and stay readable by older installers. Deselected hosts are never changed. Existing CLI output keys stay. Picker and recovery decisions are pure; effects at named boundaries. Tests run as JavaScript with type checking off.

**Never:** Run `sudo`; run package lifecycle scripts; reuse an archive found in the project; auto-recover a **Preserve** failure (symlink escape, modified or unmanaged files, edited skills, drift, source mismatch); move a user settings file; let headless discovery use tools beyond read-only repository access and the knowledge server's write tools, or load project hooks; execute free text from `pending-tasks.json`; collect credentials; claim a host `HOST_NAMES` does not list (Codex, Claude Code); echo rejected input or control characters.

## Acceptance Criteria

1. Given Codex and Claude Code are picked, when setup runs, then each host's registration and discovery is verified and reported under that host, and host-neutral results are reported once.
2. Given any Auto failure in the recovery table, then its recovery runs (attempt-capped) and the run continues without asking; if the recovery itself fails, its `onFailure` instruction applies. The log records failure and action.
3. Given a Stop or Preserve failure, then only that step or host stops, the rest finish, and the message gives cause, exact instruction and log path.
4. Given consent and a signed-in ticked host, when all steps finish, then discovery runs once headless as a post-pass, writes a completion marker last, and content and server are re-verified; without consent, sign-in or completion, a hand-off task is written and the final message names the exact invocation ("Use the project-bootstrap skill to finish setup").
5. Exit codes come from the table's class column: 0 ready; 2 hand-off or user action pending (including tracker secret, host sign-in); 1 Stop or Preserve; precedence 1 > 2 > 0; `--strict` turns 2 into 1; stdout JSON carries `status`.
6. Given the run is killed at any step, when the same command runs again, then stale locks are taken over, leftovers swept, interrupted steps cleaned (installer-created paths only) and redone, finished steps and hosts reused, and no answered question asked again.
7. Given a second installer in the same project, then it waits up to 120 s for a live lock, takes over a dead one atomically, else reports "another installation is running".
8. Given the host or workflow checklist: nothing-ticked keeps the list open; "All" ticks all; `a` toggles; only hosts found on PATH are preselected.
9. Given a rejected text answer: `That <thing> must be <rule>, for example <valid value>.`, without echoing input.
10. Given Ctrl-C, Ctrl-D, end of input or SIGHUP in a picker: "Installation canceled; project files were not changed.", terminal restored; numbered fallback without raw mode.
11. Given `--input` with `hosts: ["codex","claude"]` and no terminal, the result equals the interactive one; a saved plan with only `host: "codex"` reads as `hosts: ["codex"]`.
12. Given a planted or tampered `pending-tasks.json` (unknown kind, bad receipt), then the skill ignores it and says so.

## Recovery table (class → exit; full detail in `elicitation/06-failure-mode-analysis.md` and `review/hardening-review.md`)

| Failure | Recovery | Class → exit |
|---|---|---|
| Network error, 5xx, 429 on download | Retry ×3 with backoff | Auto → Stop (1) |
| Checksum mismatch | Re-download once | Auto → Stop (1) |
| No Python 3.12+ | With consent: pinned `uv`, pinned Python patch, project-local dirs, `UV_NO_CONFIG` | Auto → Stop (1) |
| Unsupported platform for `uv`/Python; no `tar`; no Node; Windows runtime | Exact instruction | Stop (1) |
| Invalid `setup-plan.json` | Move to `.broken-<time>`, ask again (Stop under `--input`) | Auto |
| Invalid user settings file | Copy-backup, exact instruction | Stop (1) |
| Stale per-file or project lock | Take over after owner dead / too old | Auto |
| Host config conflict on an owned entry | Verified backup, replace via host CLI or ledger | Auto → Stop (1) |
| Conflict on an unowned entry; symlink escape; modified/unmanaged files; skill drift; source mismatch | Exact instruction | Preserve (1) |
| Host CLI missing | With consent: pinned, `--ignore-scripts`, user prefix, scrubbed env, print PATH line | Auto → User action (2) |
| Host not signed in / auth failure mid-run | Exact login command | User action (2) |
| Slow or hung process | Bounded retry with longer timeout | Auto → Stop (1) |
| Partial runtime or staging | Clean installer-created paths, redo | Auto → Stop (1) |
| Knowledge store empty | Post-pass headless discovery with consent, else hand-off | Auto / Hand-off (2) |
| Review bindings absent | Hand-off `review-setup` | Hand-off (2) |
| Tracker secret absent | Where to set it; install continues | User action (2) |

</frozen-after-approval>

## Code Map

- `packages/cli/src/host-names.ts` -- `HOST_NAMES` = `codex`, `claude`.
- `packages/cli/src/tooling-input.ts` -- `BootstrapInput.host`, `parseBootstrap`.
- `packages/cli/src/tooling-command.ts` -- `runTooling`/`execute`; output keys; `resumeTooling`.
- `packages/cli/src/tooling-node.ts` -- `inputNeeded` stops; `nodeToolingIO` catch-alls; `inspectKnowledgeContent` (catalog > 1 line).
- `packages/cli/src/tooling-files.ts` -- `setupFailure` → single `tooling-storage` code; `lockedWrite` `*.upf.lock` removed only in `finally`.
- `packages/cli/src/tooling-host.ts`, `tooling-runtime.ts` -- conflicts, staging, CLI receipt (`wireCli` sha256 pattern to reuse).
- `packages/cli/src/tooling-process.ts` -- `command` (120 s default, SIGTERM, settles on `close`), `codexAppServerRequest` (25 s fixed).
- `packages/project/src/tooling.ts` -- `bootstrapTooling` step order: `knowledge-content` before `knowledge-server`/`host-discovery`; unchanged.
- `packages/cli/scripts/installer-wizard.mjs`; `scripts/install-release.mjs` (`extract` needs Python; `spawnSync` apply); `scripts/install.sh` (fetches `install.mjs` unverified).
- `packages/cli/scripts/release-distribution.mjs` (allowlist), `check-distribution.mjs`.
- `plugins/unified-plugin-framework/skills/project-bootstrap/SKILL.md` -- says "Do not install plugins", Codex-only.
- `plugins/project-knowledge/` -- knowledge server tools (catalog/find/fetch/links/put/patch/add).
- Tests: `tooling.test.mjs`, `installer-wizard.test.mjs`, `installer-launcher.test.mjs` (asserts 3 requests in 10 s), `distribution-installer.test.mjs`.

## Tasks & Acceptance

**Execution** (dependency order):

1. [ ] `packages/cli/src/tooling-input.ts` -- per-field `parseBootstrap` railway; `AcceptedPlan` (`hosts`, `workflows`, `consent: {privatePython, installHostClis, headlessDiscovery}` default false); legacy `host` = `hosts[0]`; `forHost`; `host-required` guard; plan file writes `host`.
2. [ ] `packages/cli/src/tooling-recovery.ts` (new) -- pure `RECOVERY: ReadonlyMap<(step, code), Recovery>` with class, exit, action, `onFailure`, attempt cap; `PINS` (uv, Python patch, host CLI versions and integrity per platform); headless argv per host; task-kind enum.
3. [ ] `packages/cli/src/tooling-files.ts`, `tooling-node.ts`, `tooling-host.ts`, `tooling-runtime.ts` -- distinct failure codes and the Preserve class; per-file locks with owner and stale takeover; start-of-run sweep; in-progress markers recording installer-created paths; ownership ledger `.upf-tools/owned.json`; verified 0600 backups; completion-marker readiness for knowledge content.
4. [ ] `packages/cli/src/tooling-process.ts` -- detached spawn, process-group kill with SIGKILL escalation, timer-based settle, capped output, timeouts as parameters (including app-server); scrubbed environment option.
5. [ ] `packages/cli/src/tooling-command.ts` -- `HOST_STEPS`; pure `bootstrapHosts(ioFor, apply, plan)`: project steps once, host steps per host, `RECOVERY` applied with caps, failed host does not stop others, acquisition post-pass on the first signed-in consented host, events returned as a monoid value; `all-ready` monoid; output keeps keys, adds `project`, `hosts`, `handoffs`, `log`, `status`; resume once.
6. [ ] `packages/cli/src/install-log.ts` (new) -- JSONL of structured events only, redaction (secret-named env ≥ 8 chars, URL credentials), 0600 in 0700, 10-run retention, `mkdtemp` fallback, `--log` path from the launcher; never throws. `agent-plugin project status`.
7. [ ] `packages/cli/scripts/install-report.mjs` (new) -- pure `finishInstall(stdout, {strict})`: exit from class column; host labels; backups; login commands; exact hand-off invocation; control characters stripped.
8. [ ] `scripts/install.sh`, `scripts/install-release.mjs` -- verify `install.mjs` against SHA256SUMS; pure `main(args, io)`; classified download retries (injected clock); launcher consent then pinned `uv`/Python with project-local dirs; minimal launcher logger; wizard and report imported before applying; project lock (PID, start time, child PID; 120 s cap) and `.upf-tools/logs` only after confirmation; async apply with per-host progress; `--strict`; Git local exclude.
9. [ ] `packages/cli/scripts/release-distribution.mjs`, `check-distribution.mjs` -- allowlist new modules; check via `parseBootstrap` + `forHost`, imports every installer module, runs `skills` for both hosts and a legacy plan.
10. [ ] `packages/cli/scripts/installer-picker.mjs` (new) -- pure reducers; boundary closing/recreating `readline`, dropping queued keys, saving/restoring raw mode, settling on Ctrl-C/Ctrl-D/`end`/`close`/SIGHUP; numbered fallback; ASCII glyphs outside UTF-8.
11. [ ] `packages/cli/scripts/installer-wizard.mjs` -- `check`/`select`; PATH preselection; prompt table; read-only plan pass feeds the summary (installs, "may back up", headless consent, host CLI consent, "Not changing"); only a cancel maps to the cancel message.
12. [ ] `plugins/unified-plugin-framework/skills/project-bootstrap/SKILL.md` -- description and body: run `pending-tasks.json` tasks of known kinds after verifying the receipt, claim each with compare-and-write and stale expiry, skip tasks already ready; remove stale "Codex only" and "do not install" text.
13. [ ] Tests -- one per AC; one per recovery row (including each `onFailure` and exit code); every emitted failure code has a table entry; chaos C1–C10; kill-then-rerun per lock and marker; declining leaves the tree byte-identical; planted hand-off file; redaction with a fake secret; fake-TTY pickers; `all-ready` law; spawn-level exit codes; updated launcher test.
14. [ ] Docs -- README (consent, exit codes, `--strict`, CI snippet, picker keys), CHANGELOG, `tooling-bootstrap.md`, `vendor-payload-installation.md`.

## Design Notes

Recovery decisions are data (`RECOVERY`), applied at one boundary, so each failure code has one documented outcome and class-derived exit code, and tests iterate the table. The Preserve class keeps the protections the current code deliberately enforces. Acquisition runs after all steps because the server and skills must exist first. Hand-offs keep the run uninterrupted; `project-bootstrap` runs them now, AGE-115 makes it automatic at session start. Owner decisions: exit 2 for hand-offs; preselect only hosts found on PATH; one Story; every path recovers.

## Verification

**Commands:**
- `node --test --test-concurrency=1 packages/cli/test/tooling.test.mjs packages/cli/test/tooling-recovery.test.mjs packages/cli/test/install-log.test.mjs packages/cli/test/install-report.test.mjs packages/cli/test/installer-picker.test.mjs packages/cli/test/installer-wizard.test.mjs packages/cli/test/installer-launcher.test.mjs packages/cli/test/distribution-installer.test.mjs` -- expected: pass (after `tsc -b --noCheck`).

**Manual checks:**
- Fresh test project, both hosts, Python 3.12 hidden from PATH, one host CLI missing: consent prompts appear before any download; the run installs what is missing, collects knowledge or writes the hand-off, lists backups and login commands, exits 0 or 2; `agent-plugin project status` shows the log.
- Kill the run during apply, rerun: continues where it stopped. Decline at the summary: project unchanged.

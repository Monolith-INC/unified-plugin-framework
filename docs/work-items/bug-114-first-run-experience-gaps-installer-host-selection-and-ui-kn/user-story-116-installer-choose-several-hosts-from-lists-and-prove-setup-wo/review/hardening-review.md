# Hardening review: AGE-116 approach

Depth: Hardcore. Lenses: adversarial, edge-case-hunter, verification-gap (the installed lens set; assumption, security and source-preservation concerns were folded into the adversarial lens's brief).

## verification-gap (9 findings)

| # | Location | Problem | Fix proposed |
|---|---|---|---|
| VG1 | `tooling-command.ts` `execute` | No seam to test the per-host loop: `execute` hard-wires `nodeToolingIO`, and host steps shell out to `codex`/`claude`. | Extract `bootstrapHosts(ioFor: host => ToolingIO, apply, plan)`; test with a recording IO: host 1 inspects every step, host 2 exactly `HOST_STEPS`, `configure('host-discovery')` runs for host 2. |
| VG2 | Matrix "Several hosts" | No test runs the loop with a failing first host. | Injected IO: codex `skills` fails, claude succeeds; assert both hosts reported, status action-required, no resume. |
| VG3 | Resume once | Only a single-host resume test exists. | Two-host resume test: request applied once; not applied while host 2 is incomplete. |
| VG4 | `parseBootstrap` | `hosts: []` would parse, loop zero times, and `all-ready.empty` would report ready: the false success the Story removes. Duplicates, wrong type and `host`+`hosts` together are unpinned. | Reject empty, duplicate and non-array `hosts`; decide `host`+`hosts`; assert the error text lists valid hosts with an example; assert legacy `host` gives `hosts: ['codex']`. |
| VG5 | `install-release.mjs` glue | Report module tested with fixtures only; the glue that reads CLI output and sets the exit code stays untested, and the CLI output shape changes. | Export a thin `finishInstall(stdout) => {message, exitCode, result}` from the report module; contract test feeding real `runTooling` output (injected IO), asserting exit 2 and the message. |
| VG6 | `FOLLOW_UPS` conflict rule | The existing rule (a `host-configuration-conflict` in a follow-up step is a failure) is untested and could be lost in the move. | Cases: conflict → exit 1; failed `host-discovery` → exit 1; silent server → exit 2. |
| VG7 | Terminal boundary | Raw-mode reset, Ctrl-C/EOF, leftover keypress listeners and the exact cancel message are untested; the current message differs from the plan's text. | Picker boundary takes injectable streams; fake-TTY tests for Ctrl-C, EOF, listener removal, and ask → check → ask on one interface. |
| VG8 | Wizard tests | Existing assertions pin the old free-text prompts and "Please enter a valid value."; no replacement asserts the new rejection messages or saved-selection preselection. | Tests per text prompt for the new message; saved `workflows`/`hosts` and legacy `host` preselected in `check`. |
| VG9 | `check-distribution.mjs` | With `steps: ['cli']`, a two-host plan runs no host step for host 2, so the release check becomes parse-only. It also runs only in CI. | Add `skills` to its steps and assert both hosts in the report, or state it does not cover the loop and rely on VG1. |

## adversarial (21 findings)

| # | Location | Problem | Fix proposed |
|---|---|---|---|
| AD1 | `release-distribution.mjs` (missing from plan) | The release copies an allowlist naming only `installer-wizard.mjs`; new `installer-picker.mjs` and `install-report.mjs` would be missing from releases. | Add both to the allowlist; check-distribution imports every installer module from the archive. |
| AD2 | Picker sharing `readline` | `rl.pause()` does not detach readline's keypress handler; both consume arrows, space and Enter, leaving stale input for the next question. | Close `rl` before each picker and recreate it after, or run every prompt through one keypress reader; fake-TTY test for leaked characters. |
| AD3 | Raw-mode restore | Restoring to `false` instead of the previous `isRaw`; `finally` never runs if the promise never settles on `end`/`close`; signals bypass it. | Save and restore `isRaw`; settle on `end`, `close`, Ctrl-C, Ctrl-D; `process.once('exit')` restore; test each path. |
| AD4 | Confirm becomes a list | A buffered or double Enter could accept the installation before the summary is read. | Cursor starts on "Cancel"; drop keypresses queued before first render; reducer test. |
| AD5 | `parseBootstrap` | `host`+`hosts` together, duplicates, empty list unspecified; spread keeps legacy `host` in the saved plan; wizard reads raw saved `host`. | Reject conflicts, build `AcceptedPlan` without `host`, preselect from the parsed plan; tests. |
| AD6 | CLI output contract | Plan drops `mode`, `tooling`, `workflows`, `request`, `next`; tests, installer and the project-bootstrap skill read them. | Keep existing keys and add `hosts`; contract test for one and several hosts. |
| AD7 | Report module import timing | Imported after setup is applied; a missing module fails after the project changed. | Import wizard and report together before applying. |
| AD8 | Restricted `plan.steps` | With `steps: ['cli']` later hosts run nothing and read "ready"; without knowledge steps the report falls through to "finished". | Missing observation = "not verified", never ready or finished; test `['cli']` with two hosts. |
| AD9 | Report shape | Host-neutral outcomes sit under the first host, blaming it; `HOST_STEPS` duplicated in command and report. | Shape `{project, hosts:[…]}`; export `HOST_STEPS` once. |
| AD10 | Classification | Step names alone turn a `host-configuration-conflict` or missing host CLI on `knowledge-server` into "not ready" (exit 2). | Readiness = `knowledge-content` open, or `knowledge-server` with `tooling-missing`; any other code fails (exit 1); table tests. |
| AD11 | Exit 2 on every fresh install | Every first install exits 2, breaking automation that expects 0; stdout still says `ok:true`; no message when fully ready. | Add `status` to stdout JSON; document exit 2; print a ready message. Opt-out only if the owner wants one. |
| AD12 | Verification command | `install-release.test.mjs` does not test `scripts/install-release.mjs`; the real tests are `installer-launcher` and `distribution-installer`; nothing asserts exit 2. | Fix the Code Map and command; export a pure `main(args, io)` and keep a tiny entry; spawn-level exit-code test. |
| AD13 | "All hosts" | Invites hosts whose CLI is not installed; failure appears after files are written. | Detect host CLIs on PATH; annotate rows; preselect only found hosts; warn in summary. |
| AD14 | Terminal output | Error text could echo control characters from an untrusted plan file. | Strip control characters before printing; never echo the rejected value; test. |
| AD15 | Acceptance criteria | Tasks cite "AC 2/3/5" that the plan does not number; matrix rows have no ACs. | Number ACs, add Given/When/Then for exit codes, cancel, nothing selected, legacy plan, terminal restore; map rows to tests. |
| AD16 | Picker semantics | "All" stored or derived, `a` toggle behavior, cursor wrap, empty workflows, stale saved names undefined. | All is derived; `a` toggles all/none; ≥1 required for hosts and workflows; cursor wraps; unknown saved names dropped with a notice; reducer tests. |
| AD17 | Limited terminals | `TERM=dumb`, raw mode unsupported, non-UTF-8 glyphs, narrow widths; all reported as "canceled". | Fall back to numbered text prompts with the same validation; ASCII glyphs; distinguish picker-unavailable from cancel. |
| AD18 | Long silent apply | `spawnSync` shows nothing until every host finishes; looks like a hang. | Stream one progress line per host to stderr; keep JSON on stdout; say reruns are safe. |
| AD19 | `forHost` only enforced by types | Types are off in tests; `.mjs` callers can pass an `AcceptedPlan` and hit `HOSTS[undefined]`. | Runtime guard returning a `host-required` failure; check-distribution builds through `parseBootstrap` + `forHost`. |
| AD20 | Combined report vs `resumeTooling` | `resumeTooling` needs a `ToolingReport`; a host's `Result` failure handling unspecified. | Combined report stays `ToolingReport`-compatible; a host failure becomes that host's entry and the loop continues; test. |
| AD21 | Deselected hosts and docs | Rerun with fewer hosts leaves the other configured, silently; shipped docs (`project-bootstrap` skill, `tooling-bootstrap.md`, `vendor-payload-installation.md`) describe one host and old exit behavior. | State deselected hosts are never changed and list them in the summary; update the three docs. |

## edge-case-hunter (23 findings; 15 overlap with the lenses above)

Overlaps (signal, kept): raw-mode restore (AD3), readline keypress listener (AD2), Ctrl-C/Ctrl-D/EOF (AD3, VG7), "All" row and cursor (AD16), narrow/dumb terminal redraw (AD17), `hosts` validation (VG4, AD5), wizard reads raw saved plan (AD5), empty later-host steps (AD8), failing host stops the fold (VG2, AD20), output contract (AD6), `knowledge-server` codes (AD10), readiness not checked (AD8), stdout `ok:true` with exit 2 (AD11), release allowlist (AD1), check-distribution raw plan (AD19).

| # | Location | Problem | Fix proposed |
|---|---|---|---|
| EC1 | Workflows checklist | `parseBootstrap` accepts an empty `workflows` array; a plan with no workflows could report finished. | Require at least one workflow in `parseBootstrap` and the checklist. |
| EC2 | Later hosts | If `dependencies` runs for a later host but `host-discovery` is not in `plan.steps`, that host's dependency plugins are never activated. | When `dependencies` is in a later host's steps, include `host-discovery`. |
| EC3 | Older release archive | `--version` of a release without `install-report.mjs`. | Covered by importing before applying (AD7): fail before changes. |
| EC4 | Text prompts without defaults | Linear team/project rejection could print "for example undefined". | One prompt table (`thing`, `rule`, `example`) per text prompt; message built only from complete entries. |
| EC5 | `terminal()` catch-all | Every rejection, including picker bugs, is reported as a cancel. | Only cancellation maps to the cancel message; other errors surface as failures. |
| EC6 | Older installers on upgraded projects | A pinned older installer rejects a saved plan with only `hosts`. | Saved file also writes `host: hosts[0]`; parser accepts `host` when it equals `hosts[0]`. |
| EC7 | Error messages | Every `parseBootstrap` failure returns the same host-listing message. | Railway of per-field checks, each with its own code and message; only the host check lists hosts. |
| EC8 | Exit code precedence | One host failed, store empty and routine follow-ups open at once. | Exit 1 if anything failed, else 2 if not ready, else 0; print every non-empty class in that order. |

## adversarial, second pass on the recovery-first approach (27 findings)

| # | Problem | Fix proposed |
|---|---|---|
| R1 | Python is needed to extract the archive before the wizard exists, so `uv`/Python would download before consent. | One-line launcher consent (or `consent.privatePython` in `--input`) before fetching; declining leaves no files and no network call. |
| R2 | `uv python install 3.12` fetches an unpinned patch; `install.mjs` itself is not checked against SHA256SUMS. | Pin exact Python patch + SHA-256 per platform; `install.sh` verifies `install.mjs`. |
| R3 | `uv` reads user config/env and writes to the home cache; no arch/libc rows; needs `tar`. | `UV_NO_CONFIG`, project-local install and cache dirs, scrub `UV_*`, check `tar`; Stop rows for unsupported platform. |
| R4 | Host CLI install unpinned, runs lifecycle scripts with secrets in env; PATH only for the run. | Pinned version, `--ignore-scripts`, allowlisted env, print the PATH line; otherwise hand-off with the official command. |
| R5 | Knowledge-tools-only agent cannot read the repo; headless run loads project hooks. | Pinned headless argv: read-only repo tools + knowledge write tools, max turns, project hooks isolated; reword the Never. |
| R6 | `knowledge-content` runs before the server and skills are registered. | Acquisition is a post-pass after all steps, then re-inspect content and server. |
| R7 | A partial or guessed store passes "catalog has >1 line". | Completion marker written last; human-authored tiers stay a hand-off; timeout with partial store → exit 2. |
| R8 | Consent only exists in the interactive summary; not in plan, not persisted. | `consent` booleans in plan and saved plan (default false); discovery once per run on the first signed-in host. |
| R9 | An unsigned host cannot run the session that reads the hand-off. | Sign-in is a user command in the final message; detected by a bounded status check; auth failure mid-run → hand-off. |
| R10 | `pending-tasks.json` can be planted in a cloned repo and executed. | Closed enum of task kinds, no free text; sha256 receipt verified by the skill; skip tasks already ready. |
| R11 | Two hosts' sessions can run the same task at once. | Claim with compare-and-write and stale-claim expiry. |
| R12 | Nothing git-ignores `.upf-tools/` today. | Append to `info/exclude` (git-resolved, non-git safe); listed in the summary; logs 0600 in 0700 dir. |
| R13 | Redaction unspecified; child output may carry secrets. | Log only structured metadata, never child output; redact secret-named env values ≥ 8 chars and URL credentials. |
| R14 | Temp fallback predictable; launcher-stage failures can't use the archive's logger. | `mkdtemp` 0700, `wx` files, safe paths; minimal launcher logger passing `--log` to the CLI. |
| R15 | Lock/log/markers before confirmation break "project files were not changed". | Create them only after confirmation; declining leaves the tree byte-identical. |
| R16 | Lock records only the parent PID; orphaned child; unbounded wait. | Record PID, start time, child PID; atomic takeover; 120 s wait cap. |
| R17 | Per-file `*.upf.lock` left by SIGKILL blocks every rerun forever. | Owner PID + time in per-file locks; stale takeover; sweep leftovers at start. |
| R18 | "Redo from clean" undefined; could delete user files. | Per-step cleanup limited to installer-created paths recorded in the marker. |
| R19 | `command` timeout is 120 s, SIGTERM only, waits on `close`; app-server 25 s hard-coded; `spawnSync` unbounded. | Kill process group with SIGKILL escalation, timer-based settle, capped output, parameterised timeouts, async spawn. |
| R20 | Auto recoveries have no failure path or attempt cap. | `onFailure` Stop per recovery; attempt cap per (step, code, host). |
| R21 | `tooling-storage` code covers deliberate protections too. | Distinct codes and a `Preserve` class (never auto-recovered); test every emitted code has a table entry. |
| R22 | Moving user settings files hides committed files. | Move only `setup-plan.json`; copy-backup user settings and Stop for that step; Stop under `--input`. |
| R23 | No ownership ledger; rewriting `~/.claude.json` directly is unsafe. | `.upf-tools/owned.json` with entry hashes; keep using the `claude` CLI; unique 0600 backups, verified. |
| R24 | Tracker secret as Stop makes every Linear first install exit 1. | Class "User action" → exit 2; table test for each row's exit code. |
| R25 | Cached-archive reuse lets a cloned repo supply code; retries unclassified. | Drop project-cache reuse; retry only network errors, 5xx, 429 with injected clock; update launcher test. |
| R26 | Summary can't know backups before apply. | Read-only plan pass feeds the summary; "may back up" wording. |
| R27 | `project-bootstrap` skill text forbids installs and names only Codex; a vague sentence may not trigger it. | Exact invocation sentence; update description and stale text; test message ↔ skill name. |

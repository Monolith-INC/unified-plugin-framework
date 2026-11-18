# Hardening triage: AGE-116 approach

Verdicts: **patch** (fold into the approach), **decide** (owner choice), **reject** (with reason). Findings that overlap across lenses are merged into one row and noted.

## Patch into the approach

| Finding(s) | Change to the approach |
|---|---|
| VG1, VG2, VG3, AD20 | Extract `bootstrapHosts(ioFor, apply, plan)` as the testable loop; a host's `Result` failure becomes that host's action-required entry and the loop continues; combined report stays `ToolingReport`-compatible for `resumeTooling`; recording-IO tests for host steps, a failing first host, and resume-once (also not while a host is incomplete). |
| VG4, AD5, AD19 | `parseBootstrap`: reject empty, duplicate, non-array `hosts`, and `host`+`hosts` that disagree; `AcceptedPlan` built without `host`; wizard preselects from the parsed plan; runtime guard in per-host entry points (`host-required`); error text lists valid hosts with an example and never echoes the rejected value. |
| AD6, AD9, AD8 | Output keeps `mode`, `tooling`, `workflows`, `request`, `next` and adds `project` (host-neutral steps, run once) and `hosts:[{host, tooling}]`; `HOST_STEPS` exported once; a step the plan did not run is "not verified", never ready or finished. |
| VG5, VG6, AD10, AD12, AD7 | Report module `install-report.mjs` exports `finishInstall(stdout) => {message, exitCode, result}`; classifies by step **and** failure code (readiness = `knowledge-content` open, or `knowledge-server` with `tooling-missing`; conflicts and other codes fail with exit 1); `install-release.mjs` imports wizard and report before applying, and exports a pure `main(args, io)` behind a tiny entry; table tests plus a spawn-level exit-code test; verification command lists `installer-launcher` and `distribution-installer` tests. |
| AD1, VG9 | Add both new modules to the `release-distribution.mjs` allowlist; `check-distribution.mjs` builds its plan through `parseBootstrap` + `forHost`, imports every installer module from the archive, and runs `skills` for both hosts. |
| AD2, AD3, VG7, AD17 | Picker boundary: close the wizard's `readline` before a picker and recreate it after; save and restore the previous raw mode; settle on `end`, `close`, Ctrl-C, Ctrl-D; restore on `exit`; injectable streams with fake-TTY tests. Where raw mode is unavailable (`TERM=dumb`, no `setRawMode`), fall back to numbered text prompts with the same validation; ASCII glyphs when the locale is not UTF-8; "picker unavailable" is not reported as a cancel. |
| AD4 | Confirm list starts on "Cancel"; keys queued before a picker's first render are dropped; reducer test. |
| AD16, VG8 | Picker semantics: "All" is derived; `a` toggles all/none; at least one host and one workflow; cursor wraps; unknown saved names dropped with a notice; tests for each rejection message and for saved and legacy preselection. |
| AD14 | Strip control characters from any text printed by the wizard or report. |
| AD15 | Number the acceptance criteria; Given/When/Then for exit codes 0/1/2, cancel, nothing selected, legacy plan, terminal restore; map each matrix row to a named test. |
| AD18 | One progress line per host on stderr during apply; JSON stays on stdout; the cancel message says rerunning the same plan is safe. |
| AD21 (docs) | Update `plugins/unified-plugin-framework/skills/project-bootstrap/SKILL.md`, `docs/workflows/tooling-bootstrap.md`, `docs/vendor-payload-installation.md` alongside README and CHANGELOG. |
| AD21 (rerun) | State that deselected hosts are never changed; the summary lists them as "Not changing". |

## Owner decisions (answered)

| Finding | Decision |
|---|---|
| AD11 | Owner chose exit 2 for "installed, not ready yet"; stdout JSON gains `status`. |
| AD13 | Owner chose: preselect only hosts whose command-line tool is found; others shown "not found". |

## Edge-case additions (patch)

| Finding | Change to the approach |
|---|---|
| EC1 | `parseBootstrap` and the workflows checklist require at least one workflow. |
| EC2 | A later host that runs `dependencies` also runs `host-discovery`. |
| EC3 | Rejected as a separate change: importing the report module before applying (AD7) already fails before any change. |
| EC4 | One prompt table (`thing`, `rule`, `example`) drives every text prompt's rejection message. |
| EC5 | Only a cancel maps to the cancel message; other errors surface as failures. |
| EC6 | Saved plan writes `host: hosts[0]` beside `hosts`; the parser accepts `host` when it equals `hosts[0]`. Refines AD5. |
| EC7 | `parseBootstrap` becomes a railway of per-field checks with their own codes and messages. |
| EC8 | Exit precedence 1 > 2 > 0; every non-empty class printed in that order. |

## Readiness, reconciliation, risks, assumptions, technical choices, source preservation

See `readiness-and-reconciliation.md`.

| Finding | Verdict |
|---|---|
| DoD names "a fresh test project" | Patched: manual check uses a fresh project created for the check. |
| Scenario 4 asks for flags or environment variables | Kept `--input` (the existing automation flag); no environment variables. Recorded in the memlog. |
| AGE-116 says Cursor is supported | Refinement corrects AGE-116 and the delivery plan. |
| Risks, assumptions, technical choices | All mitigated or decided in the approach; no change. |
| Source preservation | No finding. |

## Second pass (recovery-first): all 27 patched

R1–R27 are patched into the approach as written in `hardening-review.md`, with two simplifications:

- R25: project-cache archive reuse is **removed** rather than secured (less code; retries cover transient errors).
- R24: the tracker secret becomes class **User action** (exit 2), consistent with the earlier decision that tracker follow-ups do not fail the install.

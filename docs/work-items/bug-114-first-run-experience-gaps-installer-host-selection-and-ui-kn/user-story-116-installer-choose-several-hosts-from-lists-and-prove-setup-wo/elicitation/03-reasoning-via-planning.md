# Reasoning via Planning: order of work and goal states

## World model

- **State that persists:** `.upf-tools/setup-plan.json` (the accepted plan, re-read on the next run), host configuration per host, the knowledge store.
- **Actors:** a person at a terminal; CI with `--input` and no terminal; the release launcher, which only forwards arguments and the exit code.
- **One shared input stream:** the wizard holds one `readline` interface on `process.stdin` for its text questions. A picker that switches the terminal to raw mode on the same stream while `readline` is also listening would get every key twice, or lose keys.

## Goal states

| Goal | Observable state | Proof |
|---|---|---|
| G1 several hosts | Plan has `hosts`; report has one entry per host | `tooling.test.mjs`: two-host plan, both hosts' discovery checked |
| G2 lists | Hosts/workflows from a checklist, single choices from a list, summary before applying | `installer-picker.test.mjs` reducers; wizard test with scripted `check`/`select` |
| G3 clear rejections | Each rejected text answer names a valid example | Wizard test: bad folder → message contains `docs/work-items` |
| G4 automation | `--input` with `hosts` gives the same plan | `install-release` / `tooling` test with two-host input and no terminal |
| G5 readiness | Empty store → exit 2, "not ready yet", next action named | `install-report.test.mjs` |

## Plan (dependency order)

1. `tooling-input.ts` (`hosts`, legacy `host`) — everything else reads this shape.
2. `tooling-command.ts` per-host loop, then `check-distribution.mjs`. G1 and G4 are provable here, before any UI work.
3. `install-report.mjs` and its use in `install-release.mjs`. G5 is independent of the UI and can ship with step 2.
4. `installer-picker.mjs` reducers, then the keypress boundary. G2.
5. `installer-wizard.mjs`: `check`/`select`, examples on rejection, summary. G2, G3.
6. README, CHANGELOG, then the manual terminal check.

Doing the plan shape and report first means a half-finished picker never leaves a release that cannot install several hosts.

## Risk found: one input stream

The picker's keypress boundary must reuse the wizard's existing `readline` interface rather than open a second listener: call `emitKeypressEvents(process.stdin, rl)`, pause the interface's line handling while a picker is open, set raw mode only for the picker's lifetime, and restore it in a `finally` so Ctrl-C or EOF never leaves the terminal in raw mode.

## Proposed changes to the approach

- Tasks: order them as in the plan above.
- Picker task: the keypress boundary shares the wizard's `readline` interface, enables raw mode only while a picker is open and always restores it.
- Matrix: add "Terminal restored" — Ctrl-C inside a picker leaves the terminal in normal mode.
- Verification: list the five test files named in the goal-state table.

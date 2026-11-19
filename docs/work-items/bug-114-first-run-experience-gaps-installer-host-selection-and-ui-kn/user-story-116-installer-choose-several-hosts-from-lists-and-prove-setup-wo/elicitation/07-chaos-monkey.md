# Chaos Monkey Scenarios: break the run partway through

Each scenario kills, corrupts or starves the installer partway through, then reruns the same command. Pass condition: the rerun **continues from where it stopped**, never repeats a finished step destructively, never asks a question already answered, and logs what happened.

| # | Chaos | What breaks today | Required behaviour | Test |
|---|---|---|---|---|
| C1 | Kill the process (SIGKILL) during `pip install` | Half-built `.project-knowledge/runtime`; next inspect may read it as present but broken | A step writes a `<step>.in-progress` marker before work and removes it after verification; a marker on the next run means "redo this step from clean". | Fake IO: marker present → step re-runs clean |
| C2 | Ctrl-C during apply, after host 1 finished | Rerun reruns everything | Rerun reuses host 1 (already verified) and continues with host 2; progress line says "Codex: already set up". | Recording IO across two runs |
| C3 | Network drops during dependency fetch | `missing`, stop | Retries with backoff, then reuses staged copies; if none, Stop names "network", logs, and the rerun resumes from the fetch. | Fetch stub failing twice then succeeding |
| C4 | `setup-plan.json` truncated (disk full mid-write) | `invalid-saved-plan` stop | Plan writes are atomic already (temp + rename); a truncated file found anyway is moved to `.broken-<time>` and the questions asked again (FMEA). | Truncated fixture |
| C5 | `~/.claude.json` locked or read-only | Write fails, stop | Retry once; still failing → Stop for that host only, with the exact permission fix; other host continues. | Write stub |
| C6 | Terminal closed (SIGHUP) mid-picker | Raw mode left on; process may hang | Restore terminal on `exit`/`SIGHUP`; treat as cancel; nothing applied. | Fake TTY `close` |
| C7 | Second installer started in the same project | Two runs write the same files | A project lock file `.upf-tools/install.lock` (PID + start time); a live lock → wait, then report "another installation is running"; a stale lock (dead PID) → take it over and log it. | Lock fixture with dead PID |
| C8 | Host CLI uninstalled between runs | `host-discovery` fails | FMEA: reinstall the host CLI (listed in summary), continue. | Discovery stub |
| C9 | Clock skew or no write access to `.upf-tools/logs` | Log write throws | Logging never fails the install: fall back to the system temp folder and say where. | Log writer stub |
| C10 | Headless discovery hangs | Installer waits forever | Bounded time (e.g. 10 minutes); on timeout, stop the child, write the hand-off task, continue. | Process stub that never exits |

## What this changes in the approach

1. **In-progress markers** per step make reruns resume safely after a kill (C1, C2).
2. **Project install lock** with stale-lock takeover (C7).
3. **Bounded child processes**: every spawned tool (pip, host CLIs, headless discovery) has a timeout and is stopped on timeout (C10, plus the 60 s `codex app-server` seen locally).
4. **Logging cannot fail the install** (C9).
5. **Signal handling** restores the terminal and leaves markers consistent on `SIGINT`, `SIGTERM`, `SIGHUP` (C6).
6. Each row becomes a named test using the injected IO; C2 and C7 run the installer twice.

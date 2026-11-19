# Pre-mortem: a month after release, a user was blocked. Why?

Assume the recovery design from Failure Mode Analysis and Chaos Monkey shipped. Each cause below is a way the user still ended up stuck. None of them is covered by the earlier two methods.

| # | Cause of the block | Why the earlier design missed it | Prevention |
|---|---|---|---|
| P1 | **Nothing ran the hand-off tasks.** AGE-116 shipped before AGE-115, so `.upf-tools/pending-tasks.json` was written but no session read it. Knowledge stayed empty and nobody said so. | Hand-off assumed AGE-115 exists. | The existing `project-bootstrap` skill (already shipped) reads `pending-tasks.json` and runs the tasks; the final message names the exact sentence to say in the first session ("finish setup"). AGE-115 later makes it automatic at session start. |
| P2 | **Headless discovery did something unwanted**: it spent the user's model quota or edited files outside the knowledge store. | "Trigger acquisition" had no limits. | Headless discovery runs only with the user's consent in the summary ("Collect project knowledge now with Claude Code: uses your plan's quota"); it is limited to the knowledge server's write tools; on refusal or no consent it becomes a hand-off. |
| P3 | **Installing a host CLI failed on permissions** (`npm i -g` → `EACCES` without sudo). | FMEA said "install", not how. | Install into a user-owned prefix (`~/.local`) and add it to the run's PATH; if that fails too, Stop for that host only with the exact command. Never run `sudo`. |
| P4 | **The user's own config was replaced.** The FMEA conflict recovery backed up and replaced a framework entry the user had customized. | Backups were logged but not shown. | Only entries the framework recorded as its own are replaced; anything else stays and is reported. The final message lists every backup made. |
| P5 | **Secrets in the log.** An error carried a token or `LINEAR_API_KEY` value into `.upf-tools/logs/`, which got committed. | The log was designed for completeness. | Redact known secret patterns and environment values before writing; `.upf-tools/` is already git-ignored. Verify that in the installer and add it if missing. |
| P6 | **The downloaded `uv` was tampered with** (proxy, mirror). | "Download uv" had no integrity check. | Pin the `uv` version and its SHA-256 per platform in the release; verify before running. |
| P7 | **Couldn't find what went wrong.** The user closed the terminal and lost the message. | Stop messages were the only pointer. | `agent-plugin project status` prints the last run's summary and log path; logs keep the last 10 runs. |
| P8 | **CI broke on every fresh install** because hand-offs exit 2. | Owner decision, but CI users were not told how to treat it. | README shows the CI snippet: treat 2 as success-with-hand-off, or pass `--strict` to make it fail. |

## What this changes in the approach

1. `project-bootstrap` skill reads and runs `pending-tasks.json` (P1); final message names the first-session sentence.
2. Headless discovery requires consent in the summary and runs with knowledge tools only (P2).
3. Host CLI installs use a user-owned prefix, never `sudo` (P3).
4. Conflict recovery replaces only framework-owned entries; backups listed in the final message (P4).
5. Log redaction; `.upf-tools/` ignored by Git (P5).
6. Pinned, checksum-verified `uv` (P6).
7. `agent-plugin project status`; keep 10 logs (P7).
8. README CI guidance for exit 2 (P8).

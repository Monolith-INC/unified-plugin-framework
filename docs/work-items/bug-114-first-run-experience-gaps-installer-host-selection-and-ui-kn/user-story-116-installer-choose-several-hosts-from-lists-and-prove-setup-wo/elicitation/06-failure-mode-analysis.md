# Failure Mode Analysis: every setup step's failure and its recovery

Owner's rule: what needs installing gets installed, what needs setup gets set up, what needs data starts collecting it. Only a truly unrecoverable failure reaches the user, with a clear instruction, and it is logged locally.

Each failure falls into one of three classes:

- **Auto:** the installer recovers and continues.
- **Hand-off:** the installer cannot finish the step itself, so it records a resumable task that the first agent session runs automatically (AGE-115 reads it). The user is not interrupted.
- **Stop:** truly unrecoverable. The user gets a one-line cause plus an exact instruction, and the error goes to the local log.

Sources: `scripts/install-release.mjs`, `packages/cli/src/tooling-*.ts`. Each "Today" entry quotes what the code does now.

| Step | Failure | Today | Recovery | Class |
|---|---|---|---|---|
| Launcher | `node` or `curl` missing | Stops: "Node.js 22+ is required." | Cannot run without Node; the message names the install command for the detected OS. | Stop |
| Download | Network error or timeout | Stops | Retry 3 times with backoff; then use an archive already in `.upf-tools/` if one of the same version exists. | Auto, then Stop |
| Download | Checksum mismatch | Stops, "nothing installed" | Download once more (a cache or proxy can corrupt it); a second mismatch is a real integrity failure. | Auto, then Stop |
| Python | No Python 3.12+ | Stops: "Python 3.12+ is required." | Install a private Python with `uv python install 3.12` when `uv` exists, or download `uv` first (one static binary) into `.upf-tools/`. Listed in the summary before confirming. | Auto |
| Settings | Saved plan or settings unreadable/invalid | Stops: "repair it before rerunning" | Move the bad file to `<name>.broken-<time>`, log it, ask the missing choices again. | Auto |
| CLI / skills | Write conflict: "Another setup is writing" or a changed file | Stops | Wait and retry once (a lock clears); if the file changed, re-read it and re-plan the write. | Auto |
| Host config | `host-configuration-conflict`: an existing entry differs | Stops: "reconcile that entry" | Back up the file (`<file>.upf-backup-<time>`), keep every unrelated entry, replace only the framework's own entry, and log the backup path. | Auto |
| Host CLI | `codex`/`claude` not installed for a ticked host | `host-discovery` fails | Install the host's CLI through its official package (listed in the summary before confirming), then continue. | Auto |
| Host CLI | Installed but not signed in | Discovery may fail | Setup files are still written; the sign-in is a hand-off: the first session of that host signs in or tells the user the one command. | Hand-off |
| Host CLI | Slow `codex app-server` (60 s timeout seen in `harness doctor`) | Fails the step | Retry with a longer timeout once. | Auto |
| Dependencies | Pinned source fetch fails | `missing`, "fetch and verify" | Retry with backoff; reuse a verified copy already staged. | Auto, then Stop |
| Knowledge runtime | `pip install` fails partway | Fails | Remove the partial environment and reinstall once; offline → reuse a staged wheel cache if present. | Auto, then Stop |
| Knowledge runtime | Windows | "currently supports Linux and macOS" | No runtime exists for it yet. | Stop |
| Knowledge content | Store empty | `knowledge-discovery-needed`, user told to run a skill | **Trigger acquisition**: run `discover-project-knowledge` headless through a signed-in host CLI ticked in the plan; if none is signed in, write a hand-off task the first session runs automatically. | Auto or Hand-off |
| Knowledge server | `--verify` fails because the store is empty | `missing` | Re-verify after acquisition; if acquisition was handed off, the first session verifies. | Auto or Hand-off |
| Review | Provider bindings absent | Follow-up for the agent | Hand-off: the first session runs `review-setup`. | Hand-off |
| Tracker | Credentials absent (e.g. `LINEAR_API_KEY`) | Follow-up | Only the user can supply a secret. The installer says exactly where to set it; setup completes everything else. | Stop (for the tracker only), install continues |
| Any step | Unexpected exception | "A tooling setup step failed" | Log the full error; continue the other steps and hosts; report the one step. | Stop for that step |

## What this changes in the approach

1. **Recovery is a step outcome, not a message.** The lifecycle's `configure` gets one bounded retry policy and named recovery actions per failure code (table above), as pure data: `ReadonlyMap<code, Recovery>`.
2. **Data acquisition is triggered**, replacing "Never fill the knowledge store from the installer": headless discovery through a signed-in host, or a hand-off task.
3. **Hand-off file** `.upf-tools/pending-tasks.json` lists what the first session must finish (knowledge discovery, review setup, host sign-in). AGE-115's session start reads it. The exit code for a run that only has hand-offs is 2 ("Installed; your first session will finish setup").
4. **Local error log** `.upf-tools/logs/install-<UTC time>.jsonl`: one line per failure and recovery (step, host, code, action taken, backup paths). Every Stop message ends with the log path.
5. **Summary before confirming** lists what will be installed (private Python, host CLIs) and what may be backed up.
6. **Stops** are limited to: no Node, integrity failure after retry, no network with nothing cached, Windows knowledge runtime, a missing secret (tracker only, install continues).

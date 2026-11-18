# Proposed Tasks for AGE-116

Parent: AGE-116. Each Task is one commit with its own tests, from the approved implementation plan (same folder). Order is the delivery order.

## 1. Plan shape for several hosts and consent

Accept a list of hosts, workflows and consent choices in the setup plan, read old single-host plans, and give each per-host step its own single-host view. Done when invalid lists are rejected with their own message, legacy plans read as one host, and consent defaults to off.

## 2. Recovery table

Add one table that gives every setup failure a class (Auto, Hand-off, User action, Stop, Preserve), an exit code, an action, a fallback and an attempt cap, plus pinned versions and the headless command per host. Done when every row's exit code is tested and every failure code the setup can produce has a row.

## 3. Safe files and resumable steps

Give file failures distinct codes and a Preserve class; make per-file locks recoverable; sweep leftovers at start; mark steps in progress so a killed run redoes only installer-created paths; keep an ownership ledger and verified backups; require a completion marker for knowledge. Done when kill-then-rerun tests pass and user files survive cleanup.

## 4. Bounded processes

Stop hung child processes and their children reliably, cap output, make timeouts configurable and scrub the environment. Done when a hung child, an ignored stop signal and a grandchild holding output all end within their limit.

## 5. Several hosts and the recovery loop

Run shared steps once and host steps per host, apply recoveries, keep going when one host fails, collect knowledge after setup, and report per host while keeping the existing output keys. Done when two-host, failing-host, restricted-step, later-host and resume-once tests pass, with the combining rule's law test.

## 6. Local install log and status

Write a structured, redacted, private log per run, keep the last 10, fall back safely when the folder is not writable, and show the last run with `agent-plugin project status`. Done when a fake secret never reaches the log and logging failures never stop setup.

## 7. Final report

Turn the setup result into the final message and exit code: host labels, backups, login commands, the exact hand-off sentence, control characters removed. Done when every (step, failure) pair gives the documented message and exit code, including from real setup output.

## 8. Launcher consent verification lock and exit codes

Verify the downloaded installer, retry downloads, ask consent before installing a private Python, log from the start, lock the project only after confirmation, show progress per host, support `--strict` and keep tool folders out of Git. Done when exit codes 0, 2 and 1 are tested end to end and declining leaves the project unchanged.

## 9. Release files

Ship the new installer modules in releases and make the release check build plans the new way, for both hosts and a legacy plan. Done when the release check imports every installer module from the archive.

## 10. Keyboard pickers

Add the checklist and single-choice list: arrows, space, "All", `a`, Enter, minimum one, confirm starting on "Cancel"; hand the terminal over safely and restore it on cancel or hang-up; fall back to numbered prompts. Done when reducer and fake-terminal tests pass.

## 11. Wizard on pickers

Ask hosts and workflows with the checklist and single choices with the list, preselect hosts found on this machine, show a valid example on every rejected answer, and show one summary of installs, backups and consents. Done when rejection, preselection and cancel tests pass.

## 12. Hand-off tasks in project-bootstrap

Let the `project-bootstrap` skill run verified hand-off tasks of known kinds once each, and ignore planted or changed ones. Done when a planted task file is ignored and a valid one runs once.

## 13. Documentation

Document consent, exit codes, `--strict`, the CI snippet and picker keys in the README, CHANGELOG and installation guides.

## 14. Staging

Run the full suite with types off once, verify payloads, and install into a fresh test project with both hosts, a missing Python and a missing host CLI.

## 15. Review

Review the Story's delivered work against its acceptance criteria on the pull request.

## 16. Breakdown

Marks the breakdown complete. Set to Done when the Tasks exist.

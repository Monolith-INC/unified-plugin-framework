---
type: risk-assessment
story: AGE-116
status: active
---

# Risk assessment: installer for several hosts that recovers from setup failures

## Why this change carries risk

Today the installer sets up one coding assistant per run, asks free-text questions, and stops at most problems with a "fix it and run again" message. The new installer sets up Codex and Claude Code in one run and repairs problems on its own: it installs a missing Python, installs a missing assistant program, backs up and replaces its own configuration entries, and asks an assistant to collect project knowledge in the background ("headless", meaning without a chat window). Each of those powers is useful, and each can do harm if it acts without permission, acts on the wrong thing, or hides a failure. The risks below are the ones the reviews found, with what the plan does about each and what is left.

## Risks

### 1. Software installed or run without the user agreeing

**What could go wrong:** the installer downloads Python, an assistant program, or starts a background assistant run before the person has said yes.

**Likelihood and impact:** likely without a guard, because the archive needs Python before the question screens exist; high impact, because it breaks the promise that nothing changes before confirmation.

**What the plan does:** one short yes/no question before Python is fetched, and one summary screen listing every install, possible backup and background run before anything else happens. Automation must turn each of these on explicitly in its plan file; they are off by default. Declining leaves the project exactly as it was, and a test checks that byte for byte.

**What remains:** a person can still say yes without reading the summary.

### 2. Tampered downloads

**What could go wrong:** a mirror, proxy or cache hands over a modified Python, Python installer, assistant program, or even a modified installer script.

**Likelihood and impact:** unlikely; very high impact, because that code then runs on the user's machine.

**What the plan does:** every download is pinned to an exact version and checked against a known fingerprint (a checksum) before use, including the installer script itself. Package install scripts are not run, and installs never use administrator rights (`sudo`). Archives found inside a project are never reused, so a cloned repository cannot supply code.

**What remains:** the pins must be updated when new versions are needed; a stale pin fails safely with a clear message.

### 3. The user's own configuration replaced

**What could go wrong:** while repairing a conflict, the installer overwrites a setting the user wrote, or a file holding sign-in state.

**Likelihood and impact:** possible; high impact for the user.

**What the plan does:** the installer records which configuration entries it created and only ever replaces those, after a verified private backup. Changes to Claude Code's own state go through Claude Code's command, not by editing its file. Anything the installer did not create, or anything that looks edited, falls into a "preserve" class: it is never changed automatically, and the person gets an exact instruction instead. Every backup is listed at the end.

**What remains:** none expected beyond normal use; tests check that user files survive.

### 4. The background assistant does too much

**What could go wrong:** the background run spends the person's assistant quota without warning, or changes files outside the knowledge store, or runs the project's own scripts.

**Likelihood and impact:** possible; medium impact.

**What the plan does:** it only runs with consent, at most once per install, with a time limit. It can read the repository and write only through the knowledge store's own tools, and the project's own startup scripts are not loaded for it. If it cannot finish, the work is handed to the person's first assistant session.

**What remains:** Codex limits access by its sandbox rather than a list of allowed tools, so its limits are slightly coarser than Claude Code's.

### 5. A planted hand-off file

**What could go wrong:** the installer leaves a list of unfinished tasks for the first assistant session. A repository could ship a fake list that makes the assistant do something unintended.

**Likelihood and impact:** unlikely; high impact.

**What the plan does:** the list contains only task names from a fixed set, never free text or commands, and carries a fingerprint the assistant checks before acting. Unknown or changed entries are ignored and reported. Each task is claimed before it runs, so two assistants never do the same task at once.

**What remains:** none expected.

### 6. Secrets in the local log

**What could go wrong:** an error message or tool output carries a password or access key into the log file, which then gets committed.

**Likelihood and impact:** possible; high impact.

**What the plan does:** the log records only structured facts (which step, which host, what happened, what was done), never raw tool output. Values that look like secrets are removed. The log is readable only by the user, and the installer's folders are added to Git's local ignore list.

**What remains:** a secret with an unusual name and shape could slip past the filter; keeping raw output out of the log limits this.

### 7. A run that never finishes

**What could go wrong:** a program the installer starts hangs, or a lock left by a crash blocks every later run.

**Likelihood and impact:** likely without a guard (a 60-second hang was seen locally); medium impact.

**What the plan does:** every started program has a time limit and is stopped together with anything it started. Locks record who owns them and are taken over when the owner is gone. A second installer waits at most two minutes. A killed run resumes where it stopped.

**What remains:** a very slow network can still hit time limits; the run then stops that one step with a clear message and the rerun continues.

### 8. Automation surprised by the new exit codes

**What could go wrong:** scripts that expect "0 means done" now see 2 on every fresh install, because knowledge collection or a sign-in usually remains.

**Likelihood and impact:** certain for existing automation; low to medium impact.

**What the plan does:** this was a deliberate choice. The output also carries a plain status, the README shows how to treat 2 in CI, and `--strict` turns 2 into a failure for those who want that.

**What remains:** existing scripts must be updated once.

### 9. The change is large

**What could go wrong:** a large change is harder to review, and mistakes slip through.

**Likelihood and impact:** likely; medium impact.

**What the plan does:** the work is split into small steps, each with its own tests, ordered so the plan format, recovery rules and multi-host setup land and can be checked before the keyboard lists. One requirements review and one in-depth review run on the finished pull request.

**What remains:** reviewers still face many files; the step order is the main defence.

### 10. The hand-off relies on later work

**What could go wrong:** the first-session automation that picks up hand-off tasks belongs to separate later work. Until that lands, nothing runs the hand-off by itself.

**Likelihood and impact:** certain until that work lands; medium impact.

**What the plan does:** the existing project setup skill runs hand-off tasks when asked, and the installer's final message gives the exact sentence to say in the first session.

**What remains:** a person who ignores the final message will not get the hand-off done until the later work lands.

## Summary

Most risks come from the new powers to install, replace and run things automatically. The plan answers them with the same three rules throughout: ask first, verify before using, and never touch what the installer did not create. The main residual risks are a person agreeing without reading, existing automation needing a one-time update for the new exit codes, and the size of the change.

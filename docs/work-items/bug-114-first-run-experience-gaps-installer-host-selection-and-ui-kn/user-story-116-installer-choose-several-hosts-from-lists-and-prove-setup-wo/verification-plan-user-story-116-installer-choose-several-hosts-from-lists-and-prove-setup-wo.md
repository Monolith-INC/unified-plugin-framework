---
type: verification-plan
story: AGE-116
status: active
---

# Verification plan: installer for several hosts that recovers from setup failures

## How the work will be proven

Every acceptance criterion is proven twice where it can be: once by automated tests that run on every change, and once by a real installation into a fresh test project. Automated tests run as plain JavaScript with type checking switched off and one test file at a time, because type checking exhausts this machine's memory. They replace the outside world with stand-ins (a fake terminal, fake programs that hang or fail, a fake clock) so that failures can be produced on demand and the results are the same every run.

## Proof for each acceptance criterion

| Acceptance criterion | Automated proof | Real-install proof |
|---|---|---|
| Set up and verify each picked host separately, reporting shared steps once | Two-host run with recorded steps: shared steps appear once, host steps once per host | Both hosts picked; the final report lists Codex and Claude Code separately |
| Keep setting up the other host when one fails | First host forced to fail; second host still set up and reported; exit code 1 | Claude Code program hidden; Codex still finishes |
| Apply the documented recovery for every failure code and log it | One test per row of the recovery table; a test that every failure the setup can produce has a row | Python hidden from the system path; the installer installs a private Python and logs it |
| Show the cause, exact instruction and log path for every stop | Each stop case checks message, instruction and log path | A forced stop shows all three |
| Collect project knowledge after setup, or write a hand-off naming the exact sentence to use | Knowledge collection runs after all steps; a timeout leaves a hand-off; a planted hand-off file is ignored | With consent, the knowledge store fills; without it, the final message gives the sentence and the setup skill runs the task |
| Ask consent before any download, install or headless run | Declining each consent prevents the matching network call and install | Consent questions appear before any download |
| Leave the project unchanged when the user declines or cancels | The project folder is compared byte for byte before and after a declined run | Declining at the summary leaves the folder unchanged |
| Continue after a killed run without repeating finished steps or questions | Runs killed at each step, then rerun: finished steps reused, interrupted ones redone, no repeated questions; stale locks taken over | The installer is killed mid-run and run again; it continues |
| Restore the terminal after cancelling inside a list | Fake terminal: Ctrl-C, Ctrl-D, end of input and hang-up each restore the previous mode | Ctrl-C inside the host list leaves a normal terminal |
| Accept `--input` with several hosts and read saved single-host plans | Two-host plan file with no terminal gives the same result as the interactive run; an old single-host plan still reads | An automation run with a two-host plan file |
| Return exit codes 0, 2 and 1 as described | The installer is started as a real process for each outcome and its exit code checked; `--strict` turns 2 into 1 | Fresh install exits 2 until knowledge is collected; a finished setup exits 0 |

## Checks that guard the edges

- **Downloads:** a tampered file is refused; network errors retry, other errors do not.
- **Secrets:** a fake secret passed through every path never appears in the log.
- **Hung programs:** a program that ignores the stop signal, and one whose child keeps its output open, are both stopped within their limit.
- **User files:** cleanup after a killed run never removes a file the installer did not create.
- **Combining results:** the rule that combines per-host results is tested for its laws (order of combining does not matter; combining with "nothing" changes nothing).
- **Release contents:** the release check imports every installer module from the built archive and installs with both hosts and with an old single-host plan.

## When the checks run

While each step is built, only the tests of the package being changed run, after building it with type checking switched off. Once all steps are done, the full suite runs once with type checking off (`node ~/.claude/scripts/suite-without-types.mjs`), followed by payload verification (`pnpm payloads:verify`) and the real install into a fresh test project. The results, including anything that failed, are recorded in this Story's folder before the pull request is opened.

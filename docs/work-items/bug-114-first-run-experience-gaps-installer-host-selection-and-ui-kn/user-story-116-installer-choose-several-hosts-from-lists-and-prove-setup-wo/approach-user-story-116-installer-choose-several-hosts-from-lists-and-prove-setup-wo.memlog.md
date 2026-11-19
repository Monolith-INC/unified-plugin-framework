---
topic: AGE-116: several hosts from lists, trustworthy setup report
updated: 2026-11-18T13:04
---

- (decision) Kept AGE-116 as one goal: the owner approved its scope on 2026-11-18 when splitting AGE-114.
- (constraint) Knowledge store held only harness settings; discovery used source inspection instead.
- (constraint) Setup hosts on main are codex and claude only (HOST_NAMES); Cursor is a payload vendor. Delivery plan and AGE-116 text that name Cursor are wrong and need correcting.
- (decision) Automation keeps --input plan files (already the CI path) with a hosts list; no new env vars - less code.
- (decision) Pickers built on node readline keypress events with pure reducers; no new terminal-UI dependency to bundle in releases.
- (decision) Run the existing lifecycle once per host instead of a new per-host step model; host-neutral steps are reused as ready.
- (assumption) Empty store or silent server ends with 'Installed, not ready yet' and exit code 2, so CI can tell it from failure (1).
- (decision) Owner chose planning depth: Hardcore (Intensivo).
- (decision) Owner applied Tree of Thoughts: per-host lifecycle loop, host-neutral steps only on the first host, check-distribution accepts hosts.
- (decision) Owner applied Self-Consistency: exit 2 only for knowledge readiness, review/tracker stay exit 0; pure install-report module with tests; All row plus a shortcut; io gains check/select.
- (decision) Owner applied Reasoning via Planning: tasks in dependency order, picker shares the wizard readline and restores raw mode, five named test files.
- (decision) Owner applied Chain-of-Thought: AcceptedPlan + forHost split, HOST_STEPS intersect plan.steps, resume once, host-labelled report, monoid law test.
- (decision) Owner applied Few-Shot exemplars: target screens in Design Notes, rejection message format, ready host still listed on failure.
- (decision) Owner chose exit code 2 for installed-but-not-ready (AD11).
- (decision) Owner chose to preselect only hosts whose CLI is found on PATH (AD13).
- (event) Hardcore hardening: 3 lenses, 53 findings; all patched into the approach except EC3 (covered by AD7).
- (decision) Scope re-check after hardening: owner kept all three parts in AGE-116 (one review, one larger PR).
- (direction) Owner (plan checkpoint, Change): every path needs a clean recovery fallback with no interruption - install what is missing, trigger setup, trigger data acquisition; inform the user only for truly irrecoverable errors, with a clear instruction, and log them locally. Use elicitation to ensure this.
- (decision) Owner applied Failure Mode Analysis: recovery table (Auto/Hand-off/Stop), triggered knowledge acquisition, pending-tasks hand-off, local install log, install list in summary.
- (decision) Owner applied Chaos Monkey: in-progress markers, install lock, bounded child processes, logging never fails install, signal handling.
- (decision) Second adversarial pass on the recovery design: 27 findings, all patched; project-cache archive reuse removed; tracker secret is class User action (exit 2).
- (decision) Owner approved the hardened recovery-first approach at the plan checkpoint (HB-Q7371B1F1).

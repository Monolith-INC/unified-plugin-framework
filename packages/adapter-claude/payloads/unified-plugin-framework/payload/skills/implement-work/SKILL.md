---
name: implement-work
description: Execute or resume approved story/task work, verify focused changes and prepare the existing review handoff.
---
<!-- Assembled at release time from the implement-work template in plugins/unified-plugin-framework and the implementation adapter. Edit those, not this copy. -->

# Implement approved work

Use the project's selected language, document paths, coding rules, branch policy, review depth and permissions. Reuse established capabilities; the readiness steps below apply when a required capability is missing, not as a repeated setup interview.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `superpowers:executing-plans`, `superpowers:verification-before-completion` and `superpowers:systematic-debugging` are available in this session. If not, ask the user to install and enable `superpowers` for this host, then continue once it is. This workflow is tested with `superpowers` 7.0.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

## Establish the authorized scope

Read the story/task and linked approved plan through `project-operations`. Read current checkout/diff and the relevant shared knowledge through catalog, search and targeted fetch. When a feature/epic lacks an implementable story/task plan, use `track-breakdown` or the appropriate existing tracking operation before coding; preserve its original requirements rather than creating another plan here.

Proceed within existing implementation authorization. Ask only for missing decisions that change scope or authority; historical session approvals do not grant new permission. Follow the project's branch policy and preserve unrelated edits. Do not mandate an extra worktree, branch stack or agent/reviewer per task. For a project using one branch from main, finish that branch before starting the next.

## Execute and resume

Use `continuity-continue` to restore progress when it is available, then verify recorded completion against current commits, files and check evidence. Resume the first unfinished authorized task. If Continuity is missing, follow its workflow readiness/tooling setup; failed journal persistence reports degraded continuity and lets coding proceed with the existing plan and available evidence. Do not create another ledger engine.

At task start and completion, call `continuity-checkpoint` with stable event identities, observed outcomes and unfinished work. Reuse the same event payload on a retry. Work-item reads, updates and artifacts use `project-operations`; resolve an uncertain write before replaying it. Missing project setup resumes through existing bootstrap, without selecting a tracker in this skill.

Use only these reviewed content excerpts under this workflow's contract. They are content guidance, not calls to native workflow conductors or their follow-up skills/scripts. The project's saved choices and authorization govern execution.

### Inline execution

Source: superpowers, `skills/executing-plans/SKILL.md` (reviewed source f38e8f2ddcf079f65493adc713c1fed78421dfaf5f4dbf6b3a6b2b1d95466e71).

Execute the plan yourself, task by task, in this session: no implementer
subagent per task, no reviewer per task. One fresh-context review of the
whole branch at the end.

### Continuous progress

Source: superpowers, `skills/executing-plans/SKILL.md` (reviewed source f38e8f2ddcf079f65493adc713c1fed78421dfaf5f4dbf6b3a6b2b1d95466e71).

**Continuous execution:** Do not pause to check in with your human partner
between tasks. They chose inline execution to spend less, not to answer
"should I continue?" after every task. Execute all tasks from the plan
without stopping.

### Observe task checks

Source: superpowers, `skills/executing-plans/SKILL.md` (reviewed source f38e8f2ddcf079f65493adc713c1fed78421dfaf5f4dbf6b3a6b2b1d95466e71).

Every step that runs a command has an `Expected:` line. Run the command,
read its output, and compare. Three outcomes:

- **Matches.** Next step.
- **The code is wrong.** Use superpowers:systematic-debugging. Find the
  cause; never patch the symptom to make the step's output match.

### Match claims to evidence

Source: superpowers, `skills/verification-before-completion/SKILL.md` (reviewed source 2befe7fc55bcadaa3d97dd9e8efeb633d2561c0ebe74c5a8b17c4d9e7e4520b3).

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

### Reproduce and locate the cause

Source: superpowers, `skills/systematic-debugging/SKILL.md` (reviewed source 51c6435d98c83c42c96ba7c35725a0b2c376cd487fb1a4e6bd0ddbe7e33ef202).

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

### Test the cause minimally

Source: superpowers, `skills/systematic-debugging/SKILL.md` (reviewed source 51c6435d98c83c42c96ba7c35725a0b2c376cd487fb1a4e6bd0ddbe7e33ef202).

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Upstream license

Source: superpowers, `LICENSE` (reviewed source a37e0e9697144819e1d965176ac4ae5bc3fa02d11e7812036bbcadf6dafe2400).

MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Execute inline by default. The excerpts supply bounded guidance; they do not authorize native helper scripts, extra workspaces, a second ledger, mandatory full tests after every task or native review/finishing conductors. Project requirements govern those choices. Use meaningful test-first work when appropriate and the narrow check that answers the current question; trivial prose or reversible low-impact edits need proportionate verification.

On failure, preserve completed work, reproduce the issue, find its cause and rerun the affected check after the fix. Resolve routine implementation choices within the approved scope; ask when the necessary change exceeds that scope or only the user can supply a decision. Never turn a failing check into a completion claim or restart unrelated tasks.

## Finish at the existing review boundary

Use `implement-verify` to prepare acceptance coverage and the review handoff. Preserve unresolved gaps with concrete recovery. Commit, push, publication, merge, deletion and tracker completion follow the project's existing bindings and approvals; preparing a handoff does not perform or prove any of those actions. Continue recoverable work without asking after every task.

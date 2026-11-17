---
name: implement-verify
description: Verify current changes against approved requirements and prepare a scoped review handoff with honest evidence and remaining gaps.
---
<!-- Assembled at release time from the implement-verify template in plugins/unified-plugin-framework and the implementation adapter. Edit those, not this copy. -->

# Verify implemented work

Reuse the project's selected language, artifact locations, shared knowledge, branch and check policy. Existing setup remains in force; the following recovery instructions apply only when a capability is unavailable.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `superpowers:verification-before-completion` is available in this session. If not, ask the user to install and enable `superpowers` for this host, then continue once it is. This workflow is tested with `superpowers` 7.0.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

Read the authoritative story/task, plan and acceptance criteria through `project-operations`, then inspect the actual change. Reuse relevant knowledge through its existing retrieval tools. If the scope or permission to change code is missing, preserve the verification request and ask for that decision; verification itself does not grant implementation authority.

Use only these reviewed content excerpts under this workflow's contract. They are content guidance, not calls to native workflow conductors or their follow-up skills/scripts. The project's saved choices and authorization govern execution.

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


For each acceptance criterion, identify the implementation and observable evidence, or a concrete gap and recovery. Distinguish code inspection, focused automated checks and actual installed-host behavior. A passed test does not establish unrelated acceptance criteria; unavailable credentials, platform checks or host behavior remain explicit limits.

Run the project's final required checks once against the current relevant code before publication. Reuse valid evidence when its relevant inputs have not changed; do not repeat a full suite at every task or claim an earlier result covers changed code. Rerun only the affected checks during development. A failing check returns to the unfinished task and its recovery; preserve prior progress and do not report completion.

Prepare a handoff containing the work-item/plan references, authorized scope, branch and base/head, acceptance-to-evidence mapping, executed checks with results and unresolved limits. Invoke the existing `review-task`, `review-story` or `review-feature` operation appropriate to the project's review policy. Reuse an already completed review of the same unchanged scope; do not add a second review loop. Follow that operation's existing posting approval.

Record observed verification progress through `continuity-checkpoint` when available, with stable retry identity. Its persistence failure does not discard the handoff. Publish artifacts or update work-item state only through `project-operations` with the existing authorization. A missing SCM/review capability needs its specific project setup recovery, not a new provider choice or invented pull request. Report code verified, review requested, published, merged and ticket done as distinct observed outcomes.

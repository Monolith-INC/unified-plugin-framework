---
name: implement-verify
description: Verify current changes against approved requirements and prepare a scoped review handoff with honest evidence and remaining gaps.
---
{{generated}}

# Verify implemented work

Reuse the project's selected language, artifact locations, shared knowledge, branch and check policy. Existing setup remains in force; the following recovery instructions apply only when a capability is unavailable.

{{readiness}}

Read the authoritative story/task, plan and acceptance criteria through `project-operations`, then inspect the actual change. Reuse relevant knowledge through its existing retrieval tools. If the scope or permission to change code is missing, preserve the verification request and ask for that decision; verification itself does not grant implementation authority.

{{delegate}}

For each acceptance criterion, identify the implementation and observable evidence, or a concrete gap and recovery. Distinguish code inspection, focused automated checks and actual installed-host behavior. A passed test does not establish unrelated acceptance criteria; unavailable credentials, platform checks or host behavior remain explicit limits.

Run the project's final required checks once against the current relevant code before publication. Reuse valid evidence when its relevant inputs have not changed; do not repeat a full suite at every task or claim an earlier result covers changed code. Rerun only the affected checks during development. A failing check returns to the unfinished task and its recovery; preserve prior progress and do not report completion.

Prepare a handoff containing the work-item/plan references, authorized scope, branch and base/head, acceptance-to-evidence mapping, executed checks with results and unresolved limits. Invoke the existing `review-task`, `review-story` or `review-feature` operation appropriate to the project's review policy. Reuse an already completed review of the same unchanged scope; do not add a second review loop. Follow that operation's existing posting approval.

Record observed verification progress through `continuity-checkpoint` when available, with stable retry identity. Its persistence failure does not discard the handoff. Publish artifacts or update work-item state only through `project-operations` with the existing authorization. A missing SCM/review capability needs its specific project setup recovery, not a new provider choice or invented pull request. Report code verified, review requested, published, merged and ticket done as distinct observed outcomes.

---
name: continuity-checkpoint
description: Save observed session progress at a meaningful event without interrupting the work or duplicating retries.
---
<!-- Assembled at release time from the continuity-checkpoint template in plugins/unified-plugin-framework and the continuity adapter. Edit those, not this copy. -->

# Save project progress

Use the session identity, project choices and capabilities established at session entry. Do not repeat setup or readiness probes for each checkpoint. The following readiness steps apply only when a required capability is missing or fails.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `agent-continuity:session-checkpoint` is available in this session. If not, ask the user to install and enable `agent-continuity` for this host, then continue once it is. This workflow is tested with `agent-continuity` 0.13.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

Use `agent-continuity:session-checkpoint`, passing along the user's request and any flags.

Record the first successful code change to each file per session, commit addition, rollback or amendment, task start or end, successful push, completed review, and session end through verified host boundaries or explicit workflow calls. Record observed outcomes; command text is not proof of success. Reuse the stable event identity and identical evidence when retrying. Keep task phases and successful operations distinguishable from failed attempts.

Save the current orientation, decisions, evidence references and unfinished work in the project's selected journal location and language. Link authoritative documents; a checkpoint does not publish documentation, modify work items, or replace the shared project knowledge store. Preserve the original event if storage fails, report its recovery briefly, continue the task and retry at the next opportunity. Report a checkpoint as saved only after confirmation.

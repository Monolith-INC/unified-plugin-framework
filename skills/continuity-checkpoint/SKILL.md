---
name: continuity-checkpoint
description: Save observed session progress at a meaningful event without interrupting the work or duplicating retries.
---
{{generated}}

# Save project progress

Use the session identity, project choices and capabilities established at session entry. Do not repeat setup or readiness probes for each checkpoint. The following readiness steps apply only when a required capability is missing or fails.

{{readiness}}

{{delegate}}

Record the first successful code change to each file per session, commit addition, rollback or amendment, task start or end, successful push, completed review, and session end through verified host boundaries or explicit workflow calls. Record observed outcomes; command text is not proof of success. Reuse the stable event identity and identical evidence when retrying. Keep task phases and successful operations distinguishable from failed attempts.

Save the current orientation, decisions, evidence references and unfinished work in the project's selected journal location and language. Link authoritative documents; a checkpoint does not publish documentation, modify work items, or replace the shared project knowledge store. Preserve the original event if storage fails, report its recovery briefly, continue the task and retry at the next opportunity. Report a checkpoint as saved only after confirmation.

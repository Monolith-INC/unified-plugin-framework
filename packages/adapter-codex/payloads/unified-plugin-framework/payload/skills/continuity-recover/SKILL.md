---
name: continuity-recover
description: Restore usable session context from readable evidence while preserving unreadable records and continuing the task.
---
<!-- Assembled at release time from the continuity-recover template in plugins/unified-plugin-framework and the continuity adapter. Edit those, not this copy. -->

# Recover project context

Reuse the established session identity, project settings and readiness result. Do not repeat bootstrap interviews or poll setup. Use the following recovery steps only when the capability itself is unavailable.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `agent-continuity:session-recover` is available in this session. If not, ask the user to install and enable `agent-continuity` for this host, then continue once it is. This workflow is tested with `agent-continuity` 0.13.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

Use `agent-continuity:session-recover`, passing along the user's request and any flags.

Preserve unreadable originals. Recover orientation, evidence and unfinished work from the last readable record, and disclose any missing history. With no readable record, start from available project context; never invent missing decisions, approvals or completed work. Check current authoritative documents and project operations before acting on historical claims.

Keep the configured document location, language and shared project knowledge store. Repeated recovery against unchanged damage should not create empty session chains. If storage is still unavailable, give the specific recovery and continue the work with available context.

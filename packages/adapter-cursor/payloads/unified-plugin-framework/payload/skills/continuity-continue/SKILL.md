---
name: continuity-continue
description: Start or resume a project session with saved orientation, decisions, evidence and unfinished work.
---
<!-- Assembled at release time from the continuity-continue template in plugins/unified-plugin-framework and the continuity adapter. Edit those, not this copy. -->

# Continue the project session

Reuse the project's language, document location and shared knowledge settings. At session entry establish the required capabilities once. Reuse that result for later checkpoints and recovery; the readiness steps below are recovery instructions when a capability is missing, not instructions to poll setup before each call.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `agent-continuity:session-continue` is available in this session. If not, ask the user to install and enable `agent-continuity` for this host, then continue once it is. This workflow is tested with `agent-continuity` 0.13.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

Read existing project choices once, using `agent-plugin project describe --project <project>` when they are not available in context. If choices are missing, use `project-bootstrap` to fill only the gap and resume this request. Use `continuity.journalRoot` from `.unified-plugin-framework.json`; when absent, propose `<artifactsPath>/sessions` and save that accepted choice through `agent-plugin project setup --project <project> --input <answers.json>`. Preserve all existing `continuity` fields in the answers object and add the accepted `journalRoot`; project setup patches the top-level settings, so a nested object must include its existing fields. Do not introduce a separate installer or repeat the tracker interview. Reading local session records does not require live tracker authentication.

Use `agent-continuity:session-continue`, passing along the user's request and any flags.

Use the host's stable chat identity and the real checkout path. A new chat restores the latest readable context in that checkout into its own chain without modifying another chat. Verify historical completion claims against authoritative evidence before acting; approvals recorded in a prior session are not fresh execution authority.

Read shared project knowledge through its catalog, search and targeted fetch. Journals hold operational evidence and links to authoritative documents, not a second knowledge store. Resume the first unfinished step supported by current evidence. Present recovery diagnostics and the restored work briefly in the saved project language.

Use a verified session-entry integration where available, or invoke this operation explicitly. Do not claim automatic invocation from installed files or skill discovery alone. An unavailable continuity capability or failed save must leave the user's work able to continue with available context.

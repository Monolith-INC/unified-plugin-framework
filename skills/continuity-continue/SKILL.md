---
name: continuity-continue
description: Start or resume a project session with saved orientation, decisions, evidence and unfinished work.
---
{{generated}}

# Continue the project session

Reuse the project's language, document location and shared knowledge settings. At session entry establish the required capabilities once. Reuse that result for later checkpoints and recovery; the readiness steps below are recovery instructions when a capability is missing, not instructions to poll setup before each call.

{{readiness}}

Read existing project choices once, using `agent-plugin project describe --project <project>` when they are not available in context. If choices are missing, use `project-bootstrap` to fill only the gap and resume this request. Use `continuity.journalRoot` from `.unified-plugin-framework.json`; when absent, propose `<artifactsPath>/sessions` and save that accepted choice through `agent-plugin project setup --project <project> --input <answers.json>`. Preserve all existing `continuity` fields in the answers object and add the accepted `journalRoot`; project setup patches the top-level settings, so a nested object must include its existing fields. Do not introduce a separate installer or repeat the tracker interview. Reading local session records does not require live tracker authentication.

{{delegate}}

Use the host's stable chat identity and the real checkout path. A new chat restores the latest readable context in that checkout into its own chain without modifying another chat. Verify historical completion claims against authoritative evidence before acting; approvals recorded in a prior session are not fresh execution authority.

Read shared project knowledge through its catalog, search and targeted fetch. Journals hold operational evidence and links to authoritative documents, not a second knowledge store. Resume the first unfinished step supported by current evidence. Present recovery diagnostics and the restored work briefly in the saved project language.

Use a verified session-entry integration where available, or invoke this operation explicitly. Do not claim automatic invocation from installed files or skill discovery alone. An unavailable continuity capability or failed save must leave the user's work able to continue with available context.

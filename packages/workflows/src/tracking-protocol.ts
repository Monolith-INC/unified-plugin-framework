/** Shared lifecycle for every tracking entry point; persistence belongs to project-operations. */
export const TRACKING_PROTOCOL = `## Use project context and preserve progress

Use project-operations for every work-item read and write. Read project settings with agent-plugin project describe --project <project-directory> (the same CLI location as project-operations); on setup-needed, use project-bootstrap. Adopt its language and artifactsPath. Reuse the saved adapter; connection failures follow its recovery, not another destination interview.

Read the shared knowledge store, approved source design, existing item and complete child/artifact listings before drafting. Retrieve only the relevant tree; follow listing cursors. Classify sections as complete, placeholder or missing and fill only gaps. Reuse item refs, parent links, source references and accepted decisions. Ask one focused batch of questions only for material unknowns, and resume the affected step after answers. Never treat a source example or default as a project decision.

Use the project's supplied team template for each item kind, preserving its headings and required fields. If absent, ask for the template or an accepted existing example; preserve a draft while waiting. Translate prose into the saved language while preserving technical identifiers. Check source requirements and acceptance criteria against the proposed items, plan steps and tasks; show a pass/gap map. Report unresolved gaps with their next action. Apply a published deterministic checker only when its actual input/template contract fits; otherwise report it as incompatible and validate against the team template. Do not claim an incompatible checker passed.

## Publish and resume

Keep the proposed change set and validation report under artifactsPath. Show item kinds, parents, source/AC links, before/after content and unresolved questions. Use existing user authorization when it covers these writes; otherwise obtain approval for the concrete proposal. Preserve the draft on rejection.

Before each write, read the current item and compare with the version used to draft; refresh only affected changes if content differs. Create parents before children with create_work_item; use update_work_item for existing refs. A split keeps the original as the source/summary and places replacement stories under its existing parent, preserving source links. Do not close or delete the original without authorization.

Record every successful ref immediately in the saved change set. On resume, get known refs and list their children/artifacts before creating anything. For an unrecorded or uncertain create, search by its source marker and read candidates before retrying; if identity is ambiguous, ask the user to resolve it. Do not blindly repeat writes. Publish plans and reports with publish_artifact using a stable kind/title/revision for the same content. Read back each changed item and its parent relationship; report partial success and the exact remaining step on failure. Record the final refs and decisions in project knowledge and name the next delivery action.`;

---
name: track-from-design
description: Turn an approved design into enriched, validated work items, implementation plans and tasks. Part of Project tracking contract v1.
---
<!-- Assembled at release time from the track-from-design template in plugins/unified-plugin-framework and the project-tracking adapter. Edit those, not this copy. -->

# Track from Design

Start from the approved design or an existing approved work item. If approval is missing, prepare the design and request approval through the appropriate discovery mode before publishing derived scope. Use the smallest useful artifact set; do not require a full document ladder for a small deliverable.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `agile-backlog-toolkit:generate-work-item` is available in this session. If not, ask the user to install and enable `agile-backlog-toolkit` for this host, then continue once it is. This workflow is tested with `agile-backlog-toolkit` 0.12.1. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

## Use project context and preserve progress

Use project-operations for every work-item read and write. Read project settings with agent-plugin project describe --project <project-directory> (the same CLI location as project-operations); on setup-needed, use project-bootstrap. Adopt its language and artifactsPath. Reuse the saved adapter; connection failures follow its recovery, not another destination interview.

Read the shared knowledge store, approved source design, existing item and complete child/artifact listings before drafting. Retrieve only the relevant tree; follow listing cursors. Classify sections as complete, placeholder or missing and fill only gaps. Reuse item refs, parent links, source references and accepted decisions. Ask one focused batch of questions only for material unknowns, and resume the affected step after answers. Never treat a source example or default as a project decision.

Use the project's supplied team template for each item kind, preserving its headings and required fields. If absent, ask for the template or an accepted existing example; preserve a draft while waiting. Translate prose into the saved language while preserving technical identifiers. Check source requirements and acceptance criteria against the proposed items, plan steps and tasks; show a pass/gap map. Report unresolved gaps with their next action. Apply a published deterministic checker only when its actual input/template contract fits; otherwise report it as incompatible and validate against the team template. Do not claim an incompatible checker passed.

## Publish and resume

Keep the proposed change set and validation report under artifactsPath. Show item kinds, parents, source/AC links, before/after content and unresolved questions. Use existing user authorization when it covers these writes; otherwise obtain approval for the concrete proposal. Preserve the draft on rejection.

Before each write, read the current item and compare with the version used to draft; refresh only affected changes if content differs. Create parents before children with create_work_item; use update_work_item for existing refs. A split keeps the original as the source/summary and places replacement stories under its existing parent, preserving source links. Do not close or delete the original without authorization.

Record every successful ref immediately in the saved change set. On resume, get known refs and list their children/artifacts before creating anything. For an unrecorded or uncertain create, search by its source marker and read candidates before retrying; if identity is ambiguous, ask the user to resolve it. Do not blindly repeat writes. Publish plans and reports with publish_artifact using a stable kind/title/revision for the same content. Read back each changed item and its parent relationship; report partial success and the exact remaining step on failure. Record the final refs and decisions in project knowledge and name the next delivery action.

## Deliver the work-item tree

Use only these reviewed content excerpts. They are content guidance, not calls to native workflow conductors. Project operations supply reads, hierarchy changes and publication. The project's team template and saved language take precedence; proposed assumptions require confirmation.

### Requirement coverage

Source: agile-backlog-toolkit, `references/audit-checklist.md` (reviewed source dfb4cfa5e70e769ffe8de79df2ef6696af2c60b74c41bf561449fb3f9e1b14af).

## b) Coverage (the safeguard against silent requirement loss)
Build a parent-requirement → Story map:
- [ ] Every requirement / acceptance criterion in the PARENT text maps to ≥1 child Story.
- [ ] Flag any **orphan requirement** (in the parent, in no Story) — a dropped requirement.
- [ ] Flag any **unanchored Story scope** (in a Story, not in the parent) — scope creep.

Emit the map as a requirement-by-requirement pass/gap report.

### Upstream license

Source: agile-backlog-toolkit, `LICENSE` (reviewed source dc06e35bccf00e3f5c74fb57b52021c1464ccb8cbd119e63219c2018e1c53336).

MIT License

Copyright (c) 2026 Théo Carranza

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


Size the approved scope: several capabilities suggest an epic, one capability a feature, and one independently deliverable change a user story. Confirm material sizing assumptions with the user and use the project's hierarchy and agreed delivery ceiling. Reuse existing matching work rather than creating another root.

Draft the initial item with traceable source requirements and acceptance criteria. Run `track-enrich` and `track-validate`. For an epic or feature use `track-decompose` and apply those steps to its children. For an oversized story use `track-split`; for an implementable story use `track-breakdown`. Continue until each leaf story has a validated plan and atomic tasks. Reuse the same context and authorization across these steps.

Present the complete tree, coverage report and plans before publication through the shared protocol. Finish with the saved artifact paths, verified item refs, any remaining user decisions and the first implementable task.

---
name: track-split
description: Split an oversized story into deliverable stories while retaining its acceptance criteria, source and parent. Part of Project tracking contract v1.
---
<!-- Assembled at release time from the track-split template in plugins/unified-plugin-framework and the project-tracking adapter. Edit those, not this copy. -->

# Split a Story

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `agile-backlog-toolkit:split-story` is available in this session. If not, ask the user to install and enable `agile-backlog-toolkit` for this host, then continue once it is. This workflow is tested with `agile-backlog-toolkit` 0.12.1. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

## Use project context and preserve progress

Use project-operations for every work-item read and write. Read project settings with agent-plugin project describe --project <project-directory> (the same CLI location as project-operations); on setup-needed, use project-bootstrap. Adopt its language and artifactsPath. Reuse the saved adapter; connection failures follow its recovery, not another destination interview.

Read the shared knowledge store, approved source design, existing item and complete child/artifact listings before drafting. Retrieve only the relevant tree; follow listing cursors. Classify sections as complete, placeholder or missing and fill only gaps. Reuse item refs, parent links, source references and accepted decisions. Ask one focused batch of questions only for material unknowns, and resume the affected step after answers. Never treat a source example or default as a project decision.

Use the project's supplied team template for each item kind, preserving its headings and required fields. If absent, ask for the template or an accepted existing example; preserve a draft while waiting. Translate prose into the saved language while preserving technical identifiers. Check source requirements and acceptance criteria against the proposed items, plan steps and tasks; show a pass/gap map. Report unresolved gaps with their next action. Apply a published deterministic checker only when its actual input/template contract fits; otherwise report it as incompatible and validate against the team template. Do not claim an incompatible checker passed.

## Publish and resume

Keep the proposed change set and validation report under artifactsPath. Show item kinds, parents, source/AC links, before/after content and unresolved questions. Use existing user authorization when it covers these writes; otherwise obtain approval for the concrete proposal. Preserve the draft on rejection.

Before each write, read the current item and compare with the version used to draft; refresh only affected changes if content differs. Create parents before children with create_work_item; use update_work_item for existing refs. A split keeps the original as the source/summary and places replacement stories under its existing parent, preserving source links. Do not close or delete the original without authorization.

Record every successful ref immediately in the saved change set. On resume, get known refs and list their children/artifacts before creating anything. For an unrecorded or uncertain create, search by its source marker and read candidates before retrying; if identity is ambiguous, ask the user to resolve it. Do not blindly repeat writes. Publish plans and reports with publish_artifact using a stable kind/title/revision for the same content. Read back each changed item and its parent relationship; report partial success and the exact remaining step on failure. Record the final refs and decisions in project knowledge and name the next delivery action.

## Preserve scope in smaller deliveries

Use only these reviewed content excerpts. They are content guidance, not calls to native workflow conductors. Project operations supply reads, hierarchy changes and publication. The project's team template and saved language take precedence; proposed assumptions require confirmation.

### Workflow steps

Source: agile-backlog-toolkit, `skills/split-story/references/split-patterns.md` (reviewed source a2d32ea05d4f763b48427bac59bb6c9ff8140327829db342af33cf062ee92274).

## Pattern 1 — Workflow Step

**What it means:** The story describes a sequential process with multiple distinct steps. Each
step can be delivered independently and yields value on its own.

**Detection signals:**
- Body or ACs contain sequential connectives: "first", "then", "after", "next", "finally",
  "when X is done, Y"
- Numbered list of actions in expected behavior or ACs
- The story title contains "flow", "process", or "wizard"
- Body references multiple screens or pages in a navigation sequence

**Split rule:** One sub-story per sequential step. Sub-story N can be built and tested before
step N+1 exists.

**Coverage rule:** Each step maps to one AC cluster. No step is left without a sub-story.

**Counter-signal (don't pick this pattern if):** Steps are not independently deployable — e.g.,
step 2 is only testable if step 1 is in prod. Use Happy/Unhappy Path instead if the relationship
is success vs. error.

**Example:**
Original: "As a user, I can register, verify my email, and set my profile."
Split: (1) Register — account creation, (2) Email verification, (3) Profile setup.

---

### Business-rule branches

Source: agile-backlog-toolkit, `skills/split-story/references/split-patterns.md` (reviewed source a2d32ea05d4f763b48427bac59bb6c9ff8140327829db342af33cf062ee92274).

## Pattern 2 — Business Rule

**What it means:** The story applies different logic depending on a condition. Each distinct
rule/branch can be built and tested independently.

**Detection signals:**
- ACs contain "if / when / unless / except when" branching
- ACs list multiple independent conditions each with different outcomes
- Body mentions user roles, plan tiers, permission levels, or regional rules
- Multiple `[ ]` AC checkboxes each govern a different scenario

**Split rule:** One sub-story per distinct rule branch. Sub-story titles include the condition:
"…when user is admin", "…for Pro-tier accounts".

**Coverage rule:** Every condition in the original ACs appears in exactly one sub-story.

**Counter-signal:** If branches share so much code that delivering one without the other is
meaningless (e.g., toggle on/off), use Happy/Unhappy Path instead.

**Example:**
Original: "Price shown in cart changes based on whether user has a coupon, is logged in, or
qualifies for bulk discount."
Split: (1) Logged-out base price, (2) Coupon application, (3) Bulk discount rule.

---

### Happy and unhappy paths

Source: agile-backlog-toolkit, `skills/split-story/references/split-patterns.md` (reviewed source a2d32ea05d4f763b48427bac59bb6c9ff8140327829db342af33cf062ee92274).

## Pattern 3 — Happy / Unhappy Path

**What it means:** The story describes both a success flow and one or more error/edge cases.
The error flows are independent enough to be validated separately.

**Detection signals:**
- ACs include both positive outcomes and error/validation scenarios
- Body uses phrases like "if invalid", "on failure", "error message", "fallback", "retry"
- ACs mix `should succeed when` and `should show error when` items
- The story handles a form or API call with both valid and invalid inputs

**Split rule:** Sub-story 1 = happy path only. Sub-story 2+ = error / edge cases grouped by
similarity. Sub-story 2 can reference Sub-story 1's success state as a prerequisite for negative
testing.

**Coverage rule:** Every AC item maps to happy or unhappy; none is orphaned.

**Counter-signal:** If the error handling is a single validation (one input, one error message),
it is not big enough to warrant a separate sub-story. Absorb into the happy-path story.

**Example:**
Original: "User submits payment form; card is charged; if card is declined, show error."
Split: (1) Successful payment flow, (2) Declined card and retry handling.

---

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


Use the team's agreed size ceiling and dependency constraints; if the story already fits, continue with `track-breakdown`. Choose the split pattern that creates useful deliveries. Keep the original source story as a summary and propose replacement stories under its existing parent, with explicit links to the original. Preserve completed work rather than duplicating it. Map every original acceptance criterion to its replacement story and show dependencies, uncovered requirements and unsupported additions. Enrich and validate the changed stories, then break down the fitting ones. Explain any unresolved parent or scope decision and retain the draft until resolved.

---
title: 'Connect host adapter question responses to workflow decisions'
type: 'approach'
ticket: 'AGE-196'
created: '2026-11-25'
status: 'active'
route: 'full'
route_source: 'pinned'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The prior live check showed a native control, but an agent manually supplied the selected key to UPF's continuation. An automatic host response handoff has not been demonstrated.

**Approach:** Define or extend a host-neutral adapter interface for question input and output. Concrete host adapters translate native responses into the existing UPF decision contract. Verify the interface with multiple host-shaped inputs and a live native response where supported.

## Boundaries & Constraints

**Always:** Keep vendor-specific input and output in concrete host adapters behind a host-neutral interface. Preserve stable decision instances, option keys, custom answers, dismissal and explicit consent. Use one authoritative question contract and preserve the existing fallbacks.

Research and confirm every vendor-specific behavior against that vendor's official documentation and the relevant installed host version. Record unverified behavior explicitly and do not present documentation about a generic hook as proof that a specific question tool invokes it.

Apply the user-directed continuous-work invariant in `docs/work-items/upf-continuous-workflow-constitutional-article.md`: solve routine problems silently, recover with minimal hassle, inform the person and present options for nontrivial fixes, and record and safely roll back problematic incidents. Keep mapped timeouts, escape routes, recovery procedures, and options in discrete knowledge-indexed guidance available at the point of need. This bug applies the invariant to question and callback handling; it does not claim to implement the whole product-wide article.

**Never:** Invent a host callback API, modify inherited dependency sources, use a stale response as consent, or claim a manual bridge is automatic.

**Minimal adapter contract:** For a fixed choice, the workflow receives only the selected answer ID. If the person provides a custom answer, pass its typed value too. Dismissal and unavailable are control outcomes, not answer IDs; a decline is an ordinary answer ID. An unanswered or ambiguous decision remains pending and resumable while independent work continues; it does not stop the workflow. The concrete adapter handles host-specific details. Do not add public host identifiers, consent fields, or display text to the answer.

The interface, neutral question and review templates, data representations, and flow diagrams are shown in `adapter-contract-review.md`. Its TypeScript is illustrative until verified against the existing project contracts and actual host callback capabilities.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior |
|---|---|---|
| Native choice | Matching host response and active decision | Continue once with the selected stable key. |
| Other response | Literal custom input | Preserve its text without interpreting it as consent. |
| Dismissed, duplicate, stale or ambiguous | Nonmatching or incomplete response | Do not perform a protected action. |
| Host unavailable | No suitable control or reply channel | Retain the existing safe fallback or needs-input. |

</frozen-after-approval>

## Discovery digest and Code Map

- `packages/workflows/src/question-channel.ts` selects a channel and normalizes responses against stable keys and a decision instance. It accepts a canonical response, not a Codex host payload.
- `packages/cli/src/question-command.ts` exposes stateless `prepare`, `answer`, and `next` operations. The caller owns continuation state and invokes the answer operation.
- `packages/workflows/src/questions.ts` and `skills/project-bootstrap/SKILL.md` instruct the agent to present the selected channel and feed responses back. They do not expose an automatic host callback.
- `packages/adapter-codex`, `packages/adapter-claude`, and `packages/adapter-cursor` currently implement deterministic payload adapters; investigate extending their shared contract without mixing vendor-specific runtime logic into UPF's core workflow.
- `packages/compiler/src/index.ts` defines `VendorAdapter` for payload generation, validation, and installation planning. Existing hook intents do not model native question callbacks; those compile-time adapters do not yet own runtime I/O.
- `packages/workflows/src/questions.ts` renders choices, while `question-channel.ts` decodes against caller-supplied `displayedKeys`. Verify displayed ordering and saved keys come from one authoritative source, especially for confirmation decisions.
- `packages/cli/test/question-command.test.mjs` tests the contract with constructed inputs, not a live host callback.
- The locally generated Codex app-server schema identifies `ToolRequestUserInputResponse` as a question-ID-to-answer-string map. A host adapter must establish how those values map safely to stable keys and distinguish custom input.
- The previously observed desktop response was delivered to the agent as a host message. The model then invoked `question answer` with manually constructed JSON; this is not proof of an automatic integration.
- OpenAI's [app-server documentation](https://developers.openai.com/codex/app-server/) describes an experimental user-input request and resolution notification. The installed Codex app-server's generated schema maps question IDs to answer strings. Neither fact proves a plugin has access to the desktop host's callback.
- Anthropic's [Claude Code hook reference](https://code.claude.com/docs/en/hooks) documents `AskUserQuestion`, input and post-tool response fields, and a permission-host route for noninteractive runs. Verify the actual question response schema and callback in the supported version.
- [Cursor's hook reference](https://cursor.com/docs/hooks) documents generic post-tool callbacks and redaction of some remote MCP outputs. It does not establish, by itself, that its native question UI emits a usable callback.
- [Cursor's 2.4 changelog](https://cursor.com/changelog/2-4) documents an interactive question tool and the ability to continue work while waiting for a response. It does not establish the callback schema for the installed host.
- Google's [Antigravity codelab](https://codelabs.developers.google.com/codelabs/beyond-vibe-coding-for-the-web) mentions a built-in question tool, but it does not establish its response or callback schema. Antigravity is tracked in host guidance, while the current repository's vendor payload adapters cover Codex, Claude, and Cursor.
- Project knowledge contains only `project/harness-settings`; no host callback unit was returned.

## Provisional tasks and acceptance

- Confirm each supported host's input and output against official documentation and its installed version. Implement automatic delivery only where the host exposes a verified boundary; otherwise retain the existing fallback.
- Add the smallest host-neutral interface above, using existing decision state and normalization. Put host-specific identifiers and response translation inside concrete adapters. Derive displayed choices and decoded keys from one ordering.
- Have the existing continuation owner accept a matching answer once. Unknown, stale, repeated, ambiguous or dismissed responses cannot approve an action; a host that cannot distinguish consent from custom text uses a safe fallback.
- Test conformance with the neutral examples in `host-response-examples.md`, host-specific documented fixtures, and one live native event flowing through the production adapter without manual normalization.
- Verify that a pending, dismissed, ambiguous, timed-out, disconnected, failed, or unavailable question never stops the workflow: preserve it, continue independent work while it remains resumable, and use the applicable indexed recovery route. Never turn a timeout into an answer or accept a late callback after replacement. Preserve custom text for clarification where the workflow requires it.
- Reuse the project's existing knowledge store and context mechanism for discrete question-recovery scenarios. Verify that relevant timeout, escape, and recovery guidance is retrievable at the point of need without a broad search or a second store.

## Open Questions

- Determine whether the active host exposes a supported mechanism for a plugin or process to receive the native callback automatically, without relying on model-authored translation.

## Implementation Notes

## Plan Change Log

## Review Triage Log

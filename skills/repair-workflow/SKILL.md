---
name: repair-workflow
description: Take over when a workflow hits a severe problem that ordinary readiness recovery cannot fix — diagnose safely, explain in one short message, propose a concrete fix with confirmation, and resume the original work (or give exact next steps if unfixable).
---

# Repair Workflow

Take over when another workflow skill hits a severe failure that cannot recover automatically — including a failed automatic recovery step, manifest or lock drift, missing or incompatible plugins, corrupted project settings or knowledge store state, or an unrecoverable external error.

Use the project's saved language for all messages. Never discard in-progress drafts, pending work-item requests, or saved project choices.

## Safe read-only boundary (what you may run without asking)

Before involving the user, diagnose the failure using read-only checks only:

- Run `agent-plugin adapter-check <workflow> --project <project-directory>` (using the installed project CLI) to identify the exact failing readiness step and recovery detail.
- Run `agent-plugin project describe --project <project-directory>` and `agent-plugin project handoffs --project <project-directory>` to inspect saved settings and pending handoffs.
- Inspect the error message, lock file, or configuration files in read-only mode.

Never modify user files, rewrite configuration or lock files, reinstall plugins, or run destructive commands without the user's explicit confirmation.

## Presenting questions to the user

For fixed-answer questions during diagnosis or repair, use the host's native selection controls only when they support the complete decision, including custom answers and required consent. An optional-only prompt cannot carry a required decision.

- **Single choice:** put the recommended option first and include an **Other** option so the user can type a custom answer.
- **Multiple choice:** let the user select any combination and include an **Other** option. Split lists with more than 4 options into grouped multi-selection questions of at most 4 options per group.
- **Confirmation and consent:** show two clear choices with the safe decline option as the default. Closing the prompt or sending an empty reply never counts as yes.
- **Plain wording:** write every prompt and option in the project's saved language without ticket IDs, internal document paths, or unexplained abbreviations.
- **Numbered fallback:** when the native control cannot carry the complete decision, use a suitable interactive canvas or a numbered list only when a reply channel is available. End choice lists with **Other (type your own answer)**, state the expected reply format, and re-ask if the reply does not match. Keep open-ended questions typed.
- **No reply channel:** yield `needs-input` with the pending decision, question, permitted answers and continuation; do not read stdin or apply the fix. Resume only on a matching explicit answer.
- **Decision safety:** use one answer channel per decision, associate responses with the current decision instance and stable option keys, decode numbers in displayed order, preserve custom text, and ignore stale or repeated callbacks. Dismissal, ambiguity and a default are not consent.
- **Shared decision contract:** call `agent-plugin question prepare <json>` with the question, decision instance, displayed option keys and observed host capabilities (`agent-plugin question --help` describes the inputs). Present only the returned channel. Pass its continuation and each matching host response to `agent-plugin question answer <json>`; use the returned event, not the raw response. Retain the continuation while waiting and mark it answered after one answer. For `needs-custom`, put the returned keys in `continuation.pendingCustomKeys` and ask for the literal text.

## Scenario 1: Concrete fix available

1. **Explain in one short message:** summarize what failed and why in plain language without internal ticket IDs, raw stack dumps, or unexplained abbreviations.
2. **Present one concrete fix with confirmation:** describe the exact change or command and ask for approval using a suitable native two-button confirmation (**Apply proposed fix** vs **Do not apply**, with **Do not apply** as the safe default — closing or sending an empty reply never counts as yes). Use the fallback above only when it can carry the decision; otherwise yield `needs-input`.
3. **Apply, verify, and resume:** once the user approves, apply the fix, re-run the failing readiness check to confirm the blocker is cleared, and immediately resume the original workflow operation from where it stopped.

## Scenario 2: Problem cannot be fixed automatically

When available fixes have been tried without clearing the blocker, or when the cause is external (such as host sign-in, missing tracker credentials, network access, upstream plugin release issues, or conflicting user files that cannot be overwritten safely):

1. State in one short message what failed and which checks or fixes were already tried.
2. Tell the user **exactly what to do next** (one concrete, actionable instruction).
3. Confirm that their in-progress work is preserved and give the exact skill or command to **resume from where the workflow stopped** once the manual step is complete.

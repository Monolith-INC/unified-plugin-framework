---
type: risk-assessment
story: AGE-154
status: active
---

# Risk assessment: guided interaction

The first change lets people opt in to a Codex project setting. Later changes guide questions and workflow decisions. A mistake could overwrite project settings or make a decision look approved when the person did not approve it.

## Configuration and file safety

Existing settings can use many valid TOML forms. A text match can select the wrong key or break the file. Parse the existing file, preserve explicit choices and unrelated content, verify the proposed edit and refuse shapes that cannot be edited safely. Reject linked or nonregular paths and detect concurrent changes before replacement.

## Decision safety

A host may lack a suitable question control or any reply channel. A default, dismissal or empty response is not consent. Use numbered text only when a reply is possible; otherwise return a resumable needs-input result without performing the protected action.

## Host behavior

The observed Codex feature is under development. A setting alone does not establish that a trusted project, existing session or noninteractive client offers the control. Record the host version and observed results; preserve trust and global settings.

## Existing work and delivery

The AGE-113 follow-up exists in two checkouts. Preserve the originals and later-slice changes while establishing one authoritative checkout for each ticket. Deliver the seven tasks in order and leave dependency source files unchanged. Changes to host payloads require scoped assembly and release checks.

## Recovery

If configuration cannot be read or safely changed, preserve it and return a clear recoverable failure. If host evidence is unavailable, report the limitation rather than claim the control was verified.

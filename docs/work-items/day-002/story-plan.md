# DAY-002 UPF Discovery recovery — Story plan

Feature AGE-212, Story AGE-213. Base release v0.6.0, commit `821ced4`.

Use the [ADR](adr.md) and [Spec](spec.md) for acceptance. The original implementation handoff and both installer edits are preserved. PR #47 already delivered unsupported-provider setup handling. Keep unrelated installer work and the Daybook application feature outside this Story.

1. AGE-214 — Reconcile and independently review the seven DAY-002 fixes. [FR-001](adr.md#fr-001), [FR-002](adr.md#fr-002), [FR-003](adr.md#fr-003), [FR-004](adr.md#fr-004), [FR-005](adr.md#fr-005), [FR-006](adr.md#fr-006), [FR-007](adr.md#fr-007). Reconcile against v0.6.0, preserve original and unrelated changes, run focused regression checks, and record independent review before live testing.
2. AGE-215 — Verify DAY-002 choices in Codex desktop. [FR-002](adr.md#fr-002), [FR-003](adr.md#fr-003), [FR-004](adr.md#fr-004), [FR-006](adr.md#fr-006). Begin after the preceding Task is accepted and committed. Use the reviewed candidate in Codex desktop. Capture the rendered choices, the user's actual selection, the workflow that resumes, and the design and revision shown before approval.
3. AGE-216 — Verify DAY-002 in a fresh installation. [FR-001](adr.md#fr-001), [FR-005](adr.md#fr-005), [FR-007](adr.md#fr-007). Begin after desktop verification is accepted and committed. After the desktop choice test passes, build and install the reviewed archive into a disposable project. Verify the launcher without PATH, skill provenance and installed README destinations.

Use [workflow.json](workflow.json) to bind the Story. Record evidence and independent acceptance before moving to the next Task.

# ADR — Resumable BMAD visual design handoff

**Status:** Proposed for AGE-207 delivery review. Captures the requirements of the existing plan and PR #48.

## Context and decision

The BMAD workspace must preserve the displayed options and user selection across sessions. Use one framework-owned handoff with BMAD's configured visual tools. Keep the supplied BMAD package unchanged. Product Design was explored as a separate experiment and requires refinement before it can become a delivery commitment.

### FR-001

When a BMAD visual brief is ready, the handoff shall offer BMAD's configured visual tools and make their output available to the shared selection and import flow.

### FR-002

Before asking for a mockup selection, the handoff shall save the displayed order and corresponding local files in the BMAD workspace. If generation is incomplete, then it shall retain the brief and any saved options for recovery.

### FR-003

When a fresh session receives an unambiguous selection, the handoff shall resolve it against the saved display order, import the exact selected file, and record the choice and feedback.

### FR-004

When a selection is finalized, the handoff shall record visual decisions in DESIGN.md and flow and states in EXPERIENCE.md, mark unconfirmed behavior as assumptions, and link both documents to the same imported file.

### FR-005

If a saved file is missing or changed, or a selection is ambiguous, then the handoff shall ask for clarification before updating either document. When the same selection resumes after an interruption, the handoff shall complete the update without duplicating the recorded decisions or links.

### FR-006

The framework shall ship the handoff skill and document optional registration through BMAD project customization that preserves existing handoffs and supplied packages.

## Consequences

The BMAD workspace carries the information needed to resume. The chosen-file verification and document updates apply to the output of the configured BMAD visual tool. Product Design activation, routing, and generation are outside AGE-207 acceptance.

[AGE-207](https://linear.app/agentical-monolithics/issue/AGE-207) · [PR #48](https://github.com/Monolith-INC/unified-plugin-framework/pull/48)

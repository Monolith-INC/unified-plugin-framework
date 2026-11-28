# Resumable BMAD visual design handoff (AGE-207)

## Goal

Let users explore a screen with BMAD's configured visual tools, save their choice across chats, and bring the selected mockup and decisions back into both BMAD design documents.

## Scope

Implement one framework-owned handoff skill and document its registration through BMAD's supported project customization. Keep the supplied BMAD package intact. Product Design was an experiment and needs refinement before delivery. Its integration is outside this Story's scope.

## Acceptance criteria

- Offer BMAD's configured visual tools. Save the displayed order and local artifacts in the workspace before asking the user to choose. If generation is incomplete, preserve the brief and saved choices for recovery.
- On resume, the skill reads the pending options from the workspace. Selecting Option 3 imports the exact third displayed file, records the choice and feedback, and brings both into BMAD's existing document finalization steps.
- DESIGN.md captures the visual choices. EXPERIENCE.md captures the flow and states, marking proposed behavior as assumptions. Both files link to the same imported image.
- A missing file, changed file, or ambiguous selection asks for clarification before document updates. Repeating the same selection after an interrupted import recovers the same result.

## Implementation and verification

1. Review the BMAD visual-tool route and saved option order. Use focused checks to verify the existing implementation against the revised scope.
2. Verify the documented optional registration through a project override under `_bmad/custom/`, alongside any existing handoffs. Exercise setup with an existing override to confirm user settings survive.
3. Use the fictional library pickup brief and a configured BMAD visual tool. Close the first run after the options are saved. Start a fresh run, pick a saved option, and verify the imported file matches it byte for byte.
4. Verify both document updates and include interrupted import and changed-file cases in focused tests.
5. Run the repository checks on the ticket branch before proposing delivery.

## Historical experiment

The manual library pickup trial imported Option 3 into the BMAD workspace, verified the image identity and checked both document links. The repeatable workflow will turn those steps into a persistent handoff and test resuming separately from the original chat.

## Requirements-linked delivery and review order

This order adopts the two existing PR commits at `5ee21a9`. Treat the code, documentation, and CI results as evidence to review. Keep the Story open until each Task has focused acceptance and the combined Story review passes.

- Parent Feature: [AGE-208](https://linear.app/agentical-monolithics/issue/AGE-208/feature-resumable-bmad-visual-design-handoffs)
- Story: [AGE-207](https://linear.app/agentical-monolithics/issue/AGE-207)
- Local requirements: [ADR](age-207/adr.md) and [Spec](age-207/spec.md)
- Linear copies: [ADR](https://linear.app/agentical-monolithics/document/age-207-adr-resumable-bmad-visual-design-handoff-45b28e57cb62) and [Spec](https://linear.app/agentical-monolithics/document/age-207-spec-resumable-bmad-visual-design-handoff-b81accab99ce)
- Runner input: [Story workflow](age-207/workflow.json)

### Ordered Tasks

1. AGE-209 — Verify the BMAD visual-tool handoff and optional registration. Requirements: [FR-001](age-207/adr.md#fr-001), [FR-006](age-207/adr.md#fr-006). First eligible Task.
   Inspect the shipping skill and registration guidance. Verify actual BMAD renderer output reaches selection and import. Test registration in an override with existing handoffs.
2. AGE-210 — Verify saved mockup order and exact selection after restart. Requirements: [FR-002](age-207/adr.md#fr-002), [FR-003](age-207/adr.md#fr-003). Start after the preceding Task is accepted and its commit is recorded.
   Use the three-option trial and check byte identity and saved feedback after restart. Verify what survives incomplete generation.
3. AGE-211 — Verify BMAD document finalization and interrupted recovery. Requirements: [FR-004](age-207/adr.md#fr-004), [FR-005](age-207/adr.md#fr-005). Start after the preceding Task is accepted and its commit is recorded.
   Inspect the finalization and recovery code. Verify the two documents, interruption after one write, and missing, changed, or ambiguous selections.

# BMAD Product Design handoff (AGE-207)

## Goal

Let BMAD use Product Design to explore a screen, save the user's choice across chats, and bring the chosen image and decisions back into the two BMAD design documents.

## Scope

Implement one framework-owned handoff skill and document its registration through BMAD's supported project customization. Keep the supplied BMAD and Product Design packages intact. Keep Product Design optional and use it through the active host.

## Acceptance criteria

- With Product Design and image generation available, the skill passes the BMAD brief to Product Design and asks the user to choose among the displayed mockups. It saves the display order and the corresponding local artifacts in the current BMAD workspace before waiting.
- Without either capability, the skill offers BMAD's existing visual tools and follows the same selection and import steps. An incomplete generation keeps the brief and any saved choices available for recovery.
- On resume, the skill reads the pending options from the workspace. Selecting Option 3 imports the exact third displayed file, records the choice and feedback, and brings both into BMAD's existing document finalization steps.
- DESIGN.md captures the visual choices. EXPERIENCE.md captures the flow and states, marking proposed behavior as assumptions. Both files link to the same imported image.
- A missing file, changed file, or ambiguous selection asks for clarification before document updates. Repeating the same selection after an interrupted import recovers the same result.

## Implementation and verification

1. Add a focused test for provider selection and the saved option order. Confirm it fails before implementing the new skill and its state handling.
2. Verify the documented optional registration through a project override under `_bmad/custom/`, alongside any existing handoffs. Exercise setup with an existing override to confirm user settings survive.
3. Use the fictional library pickup brief to exercise the Product Design path. Close the first run after the options are saved. Start a fresh run, pick Option 3, and verify the imported file matches it byte for byte and that both documents link to it.
4. Run the same round trip with Product Design unavailable. Use a BMAD visual tool, save the user's selection, and verify both documents. Include an interrupted import and a changed-file case in focused tests.
5. Run the repository checks on the ticket branch before proposing delivery.

## Trial evidence

The manual library pickup trial imported Option 3 into the BMAD workspace, verified the image identity and checked both document links. The repeatable workflow will turn those steps into a persistent handoff and test resuming separately from the original chat.

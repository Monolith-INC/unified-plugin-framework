# AGE-211 — BMAD finalization and recovery verification

- **FR-004.** After selecting a verified BMAD renderer output, the handoff wrote the visual decision under Layout & Spacing in DESIGN.md and the flow under Key Flows in EXPERIENCE.md. EXPERIENCE.md retained the explicit assumption. Both documents linked to the same imported mockup exactly once.
- **FR-005, invalid selection.** Entering “first or second” failed and finalization remained blocked. After a valid selection, finalization also refused a missing import and a modified import. Both documents retained their original SHA-256 values through these cases.
- **FR-005, interrupted finalization.** A disposable Python launcher passed through all writes except EXPERIENCE.md. Finalization wrote DESIGN.md, left EXPERIENCE.md byte-for-byte unchanged, and retained the `writing` journal. A fresh CLI process using the normal writer resumed from the journal and finished both documents. Repeating it preserved their finished SHA-256 values and produced no duplicate links or notes.

The reproducible inputs, state, errors, and hashes are in `/home/bhave/Projects/age-211-finalize.f1EQEz/` on the test machine. The interruption was injected at the document-writer boundary.

The final shipping skill uses the handoff command for both document writes. It checks the import before writing either one and assigns the selected link to one writer. Added regression checks cover extra selection tokens, commented-out headings, unfinished note blocks, and preservation of private mockup access.

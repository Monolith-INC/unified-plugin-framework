# Spec — Resumable BMAD visual design handoff

**Status:** Proposed for AGE-207 delivery review. See the [ADR](adr.md).

| Criterion | Given | When | Then |
| --- | --- | --- | --- |
| [AC-FR-001-2](adr.md#fr-001) | The BMAD brief is ready and a BMAD visual tool is configured | The handoff begins | The handoff offers the configured tool and uses its output in the selection and import flow. |
| [AC-FR-002-1](adr.md#fr-002) | Three mockups are displayed | The handoff pauses for a choice | The workspace records all three files in display order before waiting. |
| [AC-FR-002-2](adr.md#fr-002) | Generation stops before all options are available | A new session opens the workspace | The brief and any saved options remain available. |
| [AC-FR-003-1](adr.md#fr-003) | Three saved options and a fresh session | The user selects Option 3 and supplies feedback | The imported file matches the third displayed file byte for byte, and the choice and feedback are retained. |
| [AC-FR-004-1](adr.md#fr-004) | A verified selection and unconfirmed proposed behavior | Finalization runs | DESIGN.md records visual decisions, EXPERIENCE.md records flow and states with assumptions marked, and both link to the same imported file. |
| [AC-FR-005-1](adr.md#fr-005) | A selected file is missing, altered, or the selection is ambiguous | The user tries to finalize | The workflow requests clarification and neither document changes. |
| [AC-FR-005-2](adr.md#fr-005) | Finalization stopped after the first document was updated | A fresh session repeats the same selection | The remaining write completes and repeated links or decisions are absent. |
| [AC-FR-006-1](adr.md#fr-006) | A packaged UPF installation and an existing BMAD override | The documented optional registration is followed | The skill is available and the existing handoff settings and supplied packages are preserved. |

Record the source, documented behavior, test result, and any limitation for each criterion. A fixture representing BMAD renderer output is evidence for import behavior. Use actual BMAD renderer output to verify the handoff. AC-FR-001-1 was retired when the Product Design experiment was removed from delivery scope.

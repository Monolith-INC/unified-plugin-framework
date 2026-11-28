# Spec — Verified UPF Discovery and choice delivery

See the [ADR](adr.md). The delivery target is the UPF workflow behavior, preserving Daybook as a fictional verification project.

| Criterion | Given | When | Then |
| --- | --- | --- | --- |
| [AC-FR-001-1](adr.md#fr-001) | An installation has a project launcher and agent-plugin is absent from PATH | Discovery or setup invokes the CLI | The invocation uses the project-local launcher. |
| [AC-FR-002-1](adr.md#fr-002) | A draft is ready for review | A host presents approval | The draft or accessible reference and its exact revision are visible before the user decides. |
| [AC-FR-003-1](adr.md#fr-003) | The user chooses Forge Idea or Review | The workflow runs or resumes | Every required step has its own result or specific recovery, and any completed review matches the current revision. |
| [AC-FR-004-1](adr.md#fr-004) | Quick Discovery begins from a request, or a host returns a choice | The workflow proceeds | It runs the required lead workflow and follows the actual selection and design-approval sequence. |
| [AC-FR-005-1](adr.md#fr-005) | The project skill and a cached skill differ | The selected skill is inspected | Their reported sources and version evidence are distinguishable, with unknown versions reported honestly. |
| [AC-FR-006-1](adr.md#fr-006) | Numbered fallback presents an optional multi-select | The user replies none | The workflow records a deliberate empty choice and continues. |
| [AC-FR-007-1](adr.md#fr-007) | A fresh archive is installed | A user opens each relative README destination | Each document or section is present in the distribution. |

For desktop evidence, capture the rendered prompt, the actual selected answer, what resumes, and the design material displayed before approval. For fresh-install evidence, keep the artifact digest, installation output, and installed workflow and link checks.

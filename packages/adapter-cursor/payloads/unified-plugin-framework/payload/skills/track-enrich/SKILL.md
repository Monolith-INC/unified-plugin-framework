---
name: track-enrich
description: Fill gaps in a work item using its approved source and the project's team template. Part of Project tracking contract v1.
---
<!-- Assembled at release time from the track-enrich template in plugins/unified-plugin-framework and the project-tracking adapter. Edit those, not this copy. -->

# Enrich Work

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `agile-backlog-toolkit:enrich-work-item` is available in this session. If not, ask the user to install and enable `agile-backlog-toolkit` for this host, then continue once it is. This workflow is tested with `agile-backlog-toolkit` 0.12.1. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

## Use project context and preserve progress

Use project-operations for every work-item read and write. Read project settings with agent-plugin project describe --project <project-directory> (the same CLI location as project-operations); on setup-needed, use project-bootstrap. Adopt its language and artifactsPath. Reuse the saved adapter; connection failures follow its recovery, not another destination interview.

Read the shared knowledge store, approved source design, existing item and complete child/artifact listings before drafting. Retrieve only the relevant tree; follow listing cursors. Classify sections as complete, placeholder or missing and fill only gaps. Reuse item refs, parent links, source references and accepted decisions. Ask one focused batch of questions only for material unknowns, and resume the affected step after answers. Never treat a source example or default as a project decision.

Use the project's supplied team template for each item kind, preserving its headings and required fields. If absent, ask for the template or an accepted existing example; preserve a draft while waiting. Translate prose into the saved language while preserving technical identifiers. Check source requirements and acceptance criteria against the proposed items, plan steps and tasks; show a pass/gap map. Report unresolved gaps with their next action. Apply a published deterministic checker only when its actual input/template contract fits; otherwise report it as incompatible and validate against the team template. Do not claim an incompatible checker passed.

## Publish and resume

Keep the proposed change set and validation report under artifactsPath. Show item kinds, parents, source/AC links, before/after content and unresolved questions. Use existing user authorization when it covers these writes; otherwise obtain approval for the concrete proposal. Preserve the draft on rejection.

Before each write, read the current item and compare with the version used to draft; refresh only affected changes if content differs. Create parents before children with create_work_item; use update_work_item for existing refs. A split keeps the original as the source/summary and places replacement stories under its existing parent, preserving source links. Do not close or delete the original without authorization.

Record every successful ref immediately in the saved change set. On resume, get known refs and list their children/artifacts before creating anything. For an unrecorded or uncertain create, search by its source marker and read candidates before retrying; if identity is ambiguous, ask the user to resolve it. Do not blindly repeat writes. Publish plans and reports with publish_artifact using a stable kind/title/revision for the same content. Read back each changed item and its parent relationship; report partial success and the exact remaining step on failure. Record the final refs and decisions in project knowledge and name the next delivery action.

## Fill the gaps

Use only these reviewed content excerpts under this workflow's contract. They are content guidance, not calls to native workflow conductors or their follow-up skills/scripts. The project's saved choices and authorization govern execution.

### Preserve explicit technical requirements

Source: agile-backlog-toolkit, `common/workflows/enrichers/work-item-enricher.prompt.md` (reviewed source e3f3250d35abdff46cf44f4bc8d5fe2225076dd95bc4d3eab274b8ee388c6d48).

#### 3.1. Preservar dados técnicos da descrição original

**Regra:** Nomes e especificações técnicas **explícitos** na descrição original são **requisitos do entregável** — mantenha-os na documentação enriquecida.

**Preservar em O quê, Comportamento esperado, Critérios de Aceite ou Notas Técnicas (conforme o contexto):**
- Nomes de casos de uso, classes, serviços, interfaces (ex.: `AcceptTermsUseCase`)
- Valores de parâmetros ou enums definidos pelo autor (ex.: `actionType` "checkBoxClick", "buttonClickAccept")
- Nomes de artefatos de persistência ou integração quando citados (ex.: Hive box, nome de endpoint)
- Referências a cards ou documentos (ex.: "modelo no card #5625")

**Por quê:** Esses dados garantem consistência entre cards e código; o autor os escolheu de propósito. A regra de "não prescrever implementação" aplica-se a **não inventar** detalhes — não a **apagar** os que foram fornecidos.

**Exemplo:** Se a descrição diz "Caso de uso de AcceptTermsUseCase", a documentação enriquecida deve mencionar **AcceptTermsUseCase** (no O quê e/ou em Notas Técnicas), e não apenas "caso de uso de aceite".

### Upstream license

Source: agile-backlog-toolkit, `LICENSE` (reviewed source dc06e35bccf00e3f5c74fb57b52021c1464ccb8cbd119e63219c2018e1c53336).

MIT License

Copyright (c) 2026 Théo Carranza

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Map known source facts into the team template. Preserve completed sections, explicit technical decisions, acceptance criteria and original identity. Add missing problem, outcome, scope, dependencies, risks and testable acceptance criteria only when supported. Keep proposed assumptions separate until accepted. Explain material sizing drivers without inventing an estimate. Run `track-validate` on the result; publish an authorized, validated patch or save the remaining questions and draft for resumption.

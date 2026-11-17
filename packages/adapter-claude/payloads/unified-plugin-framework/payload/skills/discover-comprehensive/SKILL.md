---
name: discover-comprehensive
description: Use when an idea, proposal or plan is large, costly or hard to reverse and needs the deepest treatment: several perspectives, a customer-side test of the concept, a reviewed design and formal documents. Part of the Discovery workflow (contract v1).
---
<!-- Assembled at release time from the discover-comprehensive template in plugins/unified-plugin-framework and the discovery adapter. Edit those, not this copy. -->

# Discover — Comprehensive

Shape the user's starting material into a complete, well-tested design and the documents that carry it forward. Bring several perspectives to the hard questions, test the concept from the customer's side, review the design, and record it formally. Start from whatever the user brings: an idea, a proposal or an existing plan.

## Check readiness and recover

Use the project's saved language for communication, documentation and other prose. Work-item actions go through `project-operations`, which uses the configured project adapter and runs `project-bootstrap` only when setup is missing. Do not choose a tracker or call its native tools from this workflow.

Before starting, check each step in order. When a step fails, take its recovery action and continue. Involve the user only where a step says so, in one short message.

1. **Available:** `superpowers:brainstorming`, `bmad-advanced-elicitation`, `bmad-party-mode`, `bmad-forge-idea`, `bmad-prfaq`, `bmad-review`, `bmad-product-brief` and `bmad-prd` are available in this session. If not, ask the user to install and enable `superpowers` and `bmad-method` for this host, then continue once it is. This workflow is tested with `superpowers` 7.0.0 and `bmad-method` 6.12.0. If the session shows another version installed, mention it to the user once, in one line, and continue.
2. **Project knowledge store:** `.project-knowledge.json` names a `knowledgeRoot`. If not, run `project-knowledge:setup-project-knowledge` with its recommended defaults, then continue.

## Optional skills

Once, at the start, offer the user these skills to add to the session. Use any they choose at the point it fits.

- `bmad-brainstorming` — To widen the options with structured creative techniques.
- `bmad-spec` — To condense the design into a short spec that later skills build from.
- `bmad-ux` — To capture how the product looks and behaves.
- `bmad-deep-recon` — During the conversation: research each open decision and bring back cited findings before the user chooses.

## Run the session

Run `superpowers:brainstorming` throughout, passing along the user's request and any starting material.

Add these at the stages shown:

- `bmad-advanced-elicitation` — During the conversation: when an answer settles a key decision, push it further (first principles, pre-mortem, red team).
- `bmad-party-mode` — During the conversation: bring several perspectives to the hardest open question.
- `bmad-forge-idea` — Before the written design: pressure-test the idea until the user can act on it or drop it.
- `bmad-prfaq` — Before the written design: write the press release and the hard questions first, to test the concept from the customer's side.
- `bmad-review` — On the written design: run the adversarial and edge-case lenses, then revise the design with the user.
- `bmad-product-brief` — On the written design: record it as a product brief when a product-level summary is enough.
- `bmad-prd` — On the written design: record it as a PRD when the work needs full requirements.

Ground the session in the shared project knowledge store: read what the project already records before asking, and write the decisions the user reaches back to it when the session ends.

End with the written design the user approved, and name where it is saved.

---
work_item_type: User Story
type: User Story
title: 'Guide interactive workflows with clear questions and next steps'
language: en
provider: linear
provider_id: 'AGE-154'
parent_id: null
story_points: 8
---

## 🎯 What

Provide guided interaction across supported hosts: clear questions, visible work before decisions, and a useful next step. Deliver the seven planned increments in order, starting with AGE-155.

## 💡 Why

People need to steer a workflow without repeated explanations or unnecessary ceremony.

## 📋 Expected Behavior

#### Questions and decisions

- Use a suitable host control for fixed choices; otherwise provide a numbered fallback when a reply channel is available. Preserve custom answers and do not treat dismissal or ambiguity as consent.
- When a required decision has no reply channel, return a resumable needs-input result without waiting on stdin or performing the protected action.
- Codex setup offers its project question feature as an explicit opt-in and preserves existing configuration and trust.

#### Guidance and review

- Discovery guidance identifies the current step and valid directions. The next step resolves deterministically from the current state and explicit facts or events.
- Interactive transitions reject invalid events as values; recurring questions use a shared catalog.
- Accessible, host-agnostic blueprints present artifacts, choices and reviews. A review shows the actual work or a usable link and binds approval to the shown revision.
- Guidance can be paused and recovers from missing or invalid state.

## ✅ Acceptance Criteria

- [ ] Fixed-choice questions, fallbacks, custom answers and consent follow the expected behavior across supported host capabilities.
- [ ] Codex project question configuration preserves explicit choices, unrelated settings and trust; unattended decisions yield needs-input when no reply channel exists.
- [ ] Discovery directions and the next step are determined from the current state and explicit facts or events, including invalid and missing inputs.
- [ ] Interactive transitions and the recurring-question catalog use the shared workflow contracts.
- [ ] Artifact, choice and review blueprints have a readable fallback; review decisions refer to the revision shown.
- [ ] Guidance can be paused, resumes safely, and does not trap a session when local state is missing or invalid.
- [ ] The seven increments are delivered in the recorded order, with AGE-155 first; existing dependency source files remain unchanged.

## 🔧 Technical Notes

Reuse existing host, question and workflow behavior. Preserve Agent Plugins 1.0.0 conformance. The implementation plan is `docs/work-items/2026-11-21-interaction-guidance-story-and-plan.md`. Perform the scoped correctness, security and specification review described there before closing the story.

## 📊 Complexity

**8 points** — Highest driver: Scope=8, Uncertainty=5, Integrations=5, Data=3, QA=8, Rollout=3 → 8 points. The user has already chosen seven sequential delivery increments.

## 📄 Original Description

As a person working with a UPF agent, I want clear questions, visible work before decisions, and a useful next step in an interactive workflow, so that I can steer the work without repeated explanations or unnecessary ceremony.

Acceptance: native question controls with a numbered fallback and safe cancellation; preserve Codex configuration choices; a discovery storyboard and deterministic single next node with resolved guidance; pure interactive transitions; a small reusable question catalog; host-agnostic canvas blueprints for artifacts, choices and reviews. Keep guidance bounded and suspendable. Preserve dependency source files and Agent Plugins 1.0.0 conformance.

Implementation plan: docs/work-items/2026-11-21-interaction-guidance-story-and-plan.md. Deliver one sub-ticket at a time, reuse existing behavior, and perform one scoped thermo-nuclear review with GPT-6.2 Astra medium before closing. The current checkout has uncommitted follow-up work on an <issue id="f006c98c-e4bb-400d-9427-0b4b589348c6" label="AGE-113" href="https://linear.app/agentical-monolithics/issue/AGE-113/improve-the-ui-on-user-interactions" /> branch; reconcile it before starting implementation.


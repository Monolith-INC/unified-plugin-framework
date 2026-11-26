---
work_item_type: Bug
type: Bug
title: Connect host adapter question responses to workflow decisions
language: en
status: active
story_points: 8
provider: linear
provider_id: 'AGE-196'
parent_id: ''
---

## 🎯 O quê

Connect native host answers to UPF workflow decisions through a host-neutral adapter contract.

## 💡 Por quê

A visible native control does not yet prove that its answer reaches the workflow automatically.

## 📋 Comportamento esperado

#### Answer delivery

- A supported host delivers the selected stable answer ID to the matching decision without manual translation.
- A custom answer retains the person's typed value. Vendor details stay inside the concrete host adapter.
- An answer is applied at most once. Dismissed, stale, duplicate, ambiguous or unknown responses cannot authorize protected actions.

#### Continuity and recovery

- Pending or unanswered decisions remain resumable while independent authorized work continues.
- Timeouts, lost connections, unavailable controls and late responses follow the applicable indexed recovery guidance; they never become consent.
- Existing text and unattended fallbacks remain available when a native channel cannot be verified.

## ✅ Critérios de Aceite

- [ ] A supported native response reaches the matching continuation automatically with its stable answer ID.
- [ ] Custom answers retain their typed value, and unsafe or invalid responses cannot authorize an action.
- [ ] Decisions remain resumable and independent work continues across the recovery cases above.
- [ ] Relevant recovery guidance is retrievable at the point of need from the existing knowledge mechanism.
- [ ] Host-specific behavior is confirmed against the vendor's official documentation and installed version; unsupported behavior is identified.
- [ ] Focused host-shaped automated coverage and a live native check establish the actual handoff, or document a verified host limitation.

## 🔧 Notas Técnicas

Reuse the shared question contract and existing knowledge mechanism. The approved approach and contract diagrams are in the local AGE-196 work-item documents. Do not treat a generic hook or a manually supplied answer as proof of an automatic callback.

## 🔄 Como Reproduzir

1. Present a native question and select an answer.
2. Observe how the decision continuation receives it.
3. **Actual:** The observed live check required an agent to supply the answer manually. **Expected:** A supported host passes it automatically.

## 📊 Complexidade

**8 points** — Maior driver: Escopo=5, Incerteza=8, Integrações=8, Dados=2, QA=5, Rollout=1 → 8 points. Split work into verifiable tasks.

## 📄 Descrição Original

# Connect host adapter question responses to workflow decisions

\[\[Specs/spec-native-host-answer-handoff\]\]

## Requirements

* Define a host-neutral adapter interface for question input and output, with vendor-specific behavior confined to concrete host adapters.
* Connect supported native host question responses to the existing UPF decision continuation without manual translation.
* Preserve decision identity, stable option keys, custom answers, dismissal, and safe consent.
* Reuse the shared question contract and retain its text and unattended fallbacks.

## Acceptance Criteria

- [ ] A native host response reaches the matching continuation with the selected stable option key and no manual command entry.
- [ ] Custom answers are preserved and stale, duplicate, ambiguous, or dismissed responses do not trigger a protected action.
- [ ] Missing native controls and unavailable reply channels use the existing fallback contract.
- [ ] Focused automated coverage exercises actual host-shaped responses, and a live host check records the result.

## Context

<issue id="a5bebf2e-bef7-404d-b982-04fc30488f25" label="AGE-154" href="https://linear.app/agentical-monolithics/issue/AGE-154/guide-interactive-workflows-with-clear-questions-and-next-steps" /> and <issue id="91de3281-d4f8-44be-90d5-cf8c6746ddad" label="AGE-156" href="https://linear.app/agentical-monolithics/issue/AGE-156/use-native-questions-and-a-safe-fallback" /> delivered the stateless question contract. The live review showed the native control and manually supplied its selected key to the CLI. That did not verify automatic host-to-continuation integration.

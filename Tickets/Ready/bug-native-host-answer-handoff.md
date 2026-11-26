---
work_item_type: Bug
type: Bug
title: Connect host adapter question responses to workflow decisions
language: en
provider: linear
provider_id: 'AGE-196'
parent_id: ''
---

# Connect host adapter question responses to workflow decisions

[[Specs/spec-native-host-answer-handoff]]

## Requirements

- Define a host-neutral adapter interface for question input and output, with vendor-specific behavior confined to concrete host adapters.
- Connect supported native host question responses to the existing UPF decision continuation without manual translation.
- Preserve decision identity, stable option keys, custom answers, dismissal, and safe consent.
- Reuse the shared question contract and retain its text and unattended fallbacks.

## Acceptance Criteria

- [ ] A native host response reaches the matching continuation with the selected stable option key and no manual command entry.
- [ ] Custom answers are preserved and stale, duplicate, ambiguous, or dismissed responses do not trigger a protected action.
- [ ] Missing native controls and unavailable reply channels use the existing fallback contract.
- [ ] Focused automated coverage exercises actual host-shaped responses, and a live host check records the result.

## Context

AGE-154 and AGE-156 delivered the stateless question contract. The live review showed the native control and manually supplied its selected key to the CLI. That did not verify automatic host-to-continuation integration.

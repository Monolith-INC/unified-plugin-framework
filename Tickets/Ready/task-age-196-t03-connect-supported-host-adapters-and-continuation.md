---
date: 2026-11-26
type: ticket
work_item_type: Task
title: Connect supported host adapters and continuation
provider: linear
parent_id: 'AGE-196'
language: en
---

## 🎯 What

Connect supported host adapters and continuation for AGE-196.

## 📋 Expected Behavior

Route responses through concrete adapters only for boundaries verified by T01. A valid response reaches the matching continuation once. Invalid input cannot authorize an effect.

## ✅ Acceptance Criteria

- [ ] A matching answer applies once through the production continuation. Invalid or ambiguous answers cannot authorize a protected effect.

## 🔧 Technical Notes

**Trace:** T03 · R01, R02, R05, R06 · AC01, AC02. Supports AC06.  
**Source:** Approved approach, I/O & Edge-Case Matrix; `docs/work-items/bug-196-connect-codex-native-question-responses-to-workflow-decision/traceability-map.md`, T03.  
**Verification:** Exercise a documented host-shaped response through the production continuation. Check duplicate, stale, unknown, ambiguous, and dismissed responses, including attempts to authorize protected effects.

## 📄 Original Description

AGE-196 implementation plan and traceability map, T03: Connect supported host adapters and continuation.

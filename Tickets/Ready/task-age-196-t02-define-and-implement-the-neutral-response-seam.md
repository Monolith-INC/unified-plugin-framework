---
date: 2026-11-26
type: ticket
work_item_type: Task
title: Define and implement the neutral response seam
provider: linear
parent_id: 'AGE-196'
language: en
---

## 🎯 What

Define and implement the neutral response seam for AGE-196.

## 📋 Expected Behavior

Define a host-neutral contract that yields a stable answer ID for a fixed choice and retains the literal value of a custom answer. Display and decoding share one ordering.

## ✅ Acceptance Criteria

- [ ] Fixed choices return stable IDs, custom text is preserved, and displayed order matches decoding.

## 🔧 Technical Notes

**Trace:** T02 · R01, R02 · AC02. Supports AC01.  
**Source:** Adapter contract, Minimal proposed interface; `docs/work-items/bug-196-connect-codex-native-question-responses-to-workflow-decision/traceability-map.md`, T02.  
**Verification:** Run focused contract checks for reordered choices, literal custom input, and ambiguity between a choice and typed text. Verify the common contract does not expose vendor data.

## 📄 Original Description

AGE-196 implementation plan and traceability map, T02: Define and implement the neutral response seam.

---
date: 2026-11-26
type: ticket
work_item_type: Task
title: Add continuous recovery
provider: linear
parent_id: 'AGE-196'
language: en
---

## 🎯 What

Add continuous recovery for AGE-196.

## 📋 Expected Behavior

Keep unresolved decisions resumable and continue independent authorized work through channel failure. Apply existing fallbacks and applicable incident recovery.

## ✅ Acceptance Criteria

- [ ] A failed question channel leaves the decision resumable and independent work available. A replaced question ignores late responses.

## 🔧 Technical Notes

**Trace:** T04 · R02, R03 · AC02, AC03.  
**Source:** Continuous-work article, Problem handling and Decisions and waiting; `docs/work-items/bug-196-connect-codex-native-question-responses-to-workflow-decision/traceability-map.md`, T04.  
**Verification:** Exercise timeout, dismissal, disconnect, unavailable controls, and tool failure. Verify fallback, ignore a late response after replacement, and verify applicable incident and safe recovery handling.

## 📄 Original Description

AGE-196 implementation plan and traceability map, T04: Add continuous recovery.

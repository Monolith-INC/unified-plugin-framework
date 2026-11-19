---
work_item_type: Task
type: Task
title: "Project marketplace description"
language: en
provider: linear
provider_id: null
parent_id: 'AGE-133'
---

## 🎯 What

The marketplace UPF writes for each project has a description, without overwriting one the user wrote.

## 📋 Expected Behavior

- A new catalog gets the default description.
- An older catalog without one gains it on the next setup run.
- A user's own description is left unchanged.

## ✅ Acceptance Criteria

- [ ] The marketplace merge test covers a new catalog, an older catalog and a user's own description.

## 🔧 Technical Notes

`packages/adapter-claude/src/tooling.ts`, `packages/adapter-claude/test/tooling.test.mjs`.

## 📄 Original Description

Delivery step 3 of the AGE-133 implementation plan: add a default description to new and older catalogs and keep a user's own.

---
work_item_type: Task
type: Task
title: "Portable author and license"
language: en
provider: linear
provider_id: null
parent_id: 'AGE-133'
---

## 🎯 What

The portable plugin manifest accepts an optional author and license, so a plugin's maintainer and licence travel with its source.

## 📋 Expected Behavior

- A manifest with `author` (a non-empty name, plus an optional email and URL) and `license` keeps both.
- A malformed author or a non-string license is reported, and the value is left out.

## ✅ Acceptance Criteria

- [ ] Valid author and license are kept by `inspectManifest`.
- [ ] Each malformed author shape reports `manifest.author.invalid`; a non-string license reports `manifest.license.invalid_type`.

## 🔧 Technical Notes

`packages/core/src/index.ts`, `packages/core/test/inspection.test.mjs`.

## 📄 Original Description

Delivery step 1 of the AGE-133 implementation plan: add optional `author` (name, email, url) and `license` to the portable manifest, with `manifest.author.invalid` and `manifest.license.invalid_type` diagnostics and tests for valid and malformed values.

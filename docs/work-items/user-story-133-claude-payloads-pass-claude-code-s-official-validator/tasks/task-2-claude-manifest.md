---
work_item_type: Task
type: Task
title: "Claude manifest carries metadata and drops default paths"
language: en
provider: linear
provider_id: null
parent_id: 'AGE-133'
---

## 🎯 What

The Claude payload's manifest carries the plugin's author and license and stops naming component folders that Claude Code finds on its own.

## 📋 Expected Behavior

- Author and license from the portable manifest appear in `.claude-plugin/plugin.json`.
- `skills`, `hooks` and `mcpServers` are not declared at their default places.
- Released bundles that declare the default places still validate; any other place is rejected.

## ✅ Acceptance Criteria

- [ ] The adapter test shows author and license in the Claude manifest.
- [ ] A bundle declaring the default places validates; one declaring `./elsewhere/` reports `claude.manifest.component`.

## 🔧 Technical Notes

`packages/adapter-claude/src/index.ts`, `packages/adapter-claude/test/claude.test.mjs`. The adapter version stays 1.0.0.

## 📄 Original Description

Delivery step 2 of the AGE-133 implementation plan: emit author and license; stop declaring default component paths; keep accepting released bundles that declare them; reject other paths. Tests cover each case.

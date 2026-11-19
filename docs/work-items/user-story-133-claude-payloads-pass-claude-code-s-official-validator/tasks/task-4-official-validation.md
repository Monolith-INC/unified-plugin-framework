---
work_item_type: Task
type: Task
title: "Run Claude Code's validator in payload verification"
language: en
provider: linear
provider_id: null
parent_id: 'AGE-133'
---

## 🎯 What

Payload verification runs Claude Code's own validator on every Claude payload, and the shipped plugins pass it.

## 📋 Expected Behavior

- The three shipped plugins declare Monolith-INC as author and Apache-2.0 as license.
- Verification runs `claude plugin validate --strict` on each built Claude payload; a warning fails it.
- A missing CLI fails verification with an instruction to install it or set `CLAUDE_CODE_CLI`.
- CI installs Claude Code 2.1.318 before payload verification, and the docs name the requirement.

## ✅ Acceptance Criteria

- [ ] Every shipped Claude payload passes the strict validator.
- [ ] A payload built before this change fails the strict validator.
- [ ] With the CLI missing, verification fails with the install instruction.

## 🔧 Technical Notes

`plugins/{hello-world,project-knowledge,unified-plugin-framework}/plugin.json`, `packages/adapter-claude/scripts/payload.mjs`, `.github/workflows/ci.yml`, `docs/quality-gates.md`, `docs/vendor-payload-installation.md`.

## 📄 Original Description

Delivery step 4 of the AGE-133 implementation plan: declare author and license in the shipped plugins; run `claude plugin validate --strict` on each built payload, failing with an install instruction when the CLI is missing; install Claude Code 2.1.318 in CI; document the requirement.

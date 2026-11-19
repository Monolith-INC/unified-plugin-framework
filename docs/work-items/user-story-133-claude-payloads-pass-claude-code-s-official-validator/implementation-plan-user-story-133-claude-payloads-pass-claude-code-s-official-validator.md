---
type: implementation-plan
feature: none
story: AGE-133
source_digest: 03cb822aa432df79a706bf8e04faa382e89300e63531603e8ef95a570778683b
skill: generate-breakdown-work-items
language: en
status: active
created: 2026-11-19
---

# Implementation Plan for Claude payloads pass Claude Code's official validator

## Context

AGE-133 makes UPF's Claude Code payloads and project marketplace pass Claude Code's own validator with no warnings, and makes payload verification run that validator. The Story has no parent Feature. The code already exists on `feature/AGE-133-claude-payload-official-validation`, staged and uncommitted, and is being adopted (assessment HA-414A18FB4A). It lands as one labelled adoption commit, because the change was written in one pass and splitting it now would invent history. The delivery steps below map that change to Tasks so each Task's evidence can be checked.

## Acceptance criteria coverage

1. "Given the shipped plugins, when Claude payload verification runs, then every payload passes `claude plugin validate --strict`." — Steps 1, 2 and 4: author and license reach the Claude manifest, default paths are dropped, and the payload script runs the strict validator on every shipped payload.
2. "Given a payload built before this change, when the strict validator runs on it, then it fails because the author is missing." — Step 4: checked by running the strict validator on a payload built before the change.
3. "Given a bundle that names the default component places, when the Claude adapter validates it, then it passes; given one that names another place, then it fails." — Step 2: covered by the adapter test for released bundles.
4. "Given a new or older project marketplace, when setup writes it, then it has a description; given one with the user's own description, then that description is unchanged." — Step 3: covered by the marketplace merge test.
5. "Given the CI quality job on Ubuntu, Windows and macOS, when it runs, then payload verification passes on each." — Step 4: CI installs the pinned CLI; checked on the pull request's runs.

## Delivery steps

1. **Portable author and license** — `packages/core/src/index.ts`, `packages/core/test/inspection.test.mjs`. Add optional `author` (name, email, url) and `license` to the portable manifest, with `manifest.author.invalid` and `manifest.license.invalid_type` diagnostics and tests for valid and malformed values.
2. **Claude manifest** — `packages/adapter-claude/src/index.ts`, `packages/adapter-claude/test/claude.test.mjs`. Emit author and license; stop declaring default component paths; keep accepting released bundles that declare them; reject other paths. Tests cover each case.
3. **Marketplace description** — `packages/adapter-claude/src/tooling.ts`, `packages/adapter-claude/test/tooling.test.mjs`. Add a default description to new and older catalogs and keep a user's own.
4. **Official validation** — `plugins/{hello-world,project-knowledge,unified-plugin-framework}/plugin.json`, `packages/adapter-claude/scripts/payload.mjs`, `.github/workflows/ci.yml`, `docs/quality-gates.md`, `docs/vendor-payload-installation.md`. Declare author and license in the shipped plugins; run `claude plugin validate --strict` on each built payload, failing with an install instruction when the CLI is missing; install Claude Code 2.1.318 in CI; document the requirement.

## Defaults

Staging, Review and Breakdown Tasks are added during Task decomposition.

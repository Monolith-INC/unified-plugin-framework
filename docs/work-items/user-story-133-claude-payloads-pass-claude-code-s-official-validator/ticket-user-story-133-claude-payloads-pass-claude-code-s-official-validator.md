---
work_item_type: User Story
type: User Story
title: "Claude payloads pass Claude Code's official validator"
language: en
provider: linear
provider_id: 'AGE-133'
parent_id: null
story_points: 3
---

## 🎯 What

The Claude Code plugins that UPF generates, and the marketplace it writes for each project, pass Claude Code's own validator with no warnings. Building and verifying payloads runs that validator, so a change in Claude Code's plugin format is caught in CI instead of on a user's machine.

## 💡 Why

Today the payloads pass `claude plugin validate` only with warnings: no author, no license and no marketplace description. The plugin manifest also repeats default component paths that Claude Code loads on its own. Nothing in the build runs Claude Code's validator, so UPF checks its payloads only against its own hand-written schema, which can drift from what Claude Code actually accepts.

## 📋 Expected Behavior

#### Plugin metadata

- A plugin's portable manifest may declare an `author` (a non-empty name, plus an optional email and URL) and a `license`. Malformed values are reported like other manifest fields.
- The Claude payload's manifest carries the author and license from the portable manifest.
- The three shipped plugins declare Monolith-INC as author and Apache-2.0 as license.

#### Component paths

- The Claude payload's manifest no longer names `skills`, `hooks` or `mcpServers` when they sit in their default places.
- Bundles from earlier releases that name those default places still pass validation; a bundle that names a different place does not.

#### Project marketplace

- The marketplace written during setup has a description.
- A description the user wrote is kept, and an existing marketplace without one gains it on the next setup run.

#### Verification

- Verifying the Claude payloads runs `claude plugin validate --strict` on each one, so a warning fails too.
- A missing Claude Code CLI fails verification with an instruction to install it or set `CLAUDE_CODE_CLI`.
- CI installs a pinned Claude Code CLI before payload verification.

## ✅ Acceptance Criteria

- [ ] Given the shipped plugins, when Claude payload verification runs, then every payload passes `claude plugin validate --strict`.
- [ ] Given a payload built before this change, when the strict validator runs on it, then it fails because the author is missing.
- [ ] Given a bundle that names the default component places, when the Claude adapter validates it, then it passes; given one that names another place, then it fails.
- [ ] Given a new or older project marketplace, when setup writes it, then it has a description; given one with the user's own description, then that description is unchanged.
- [ ] Given the CI quality job on Ubuntu, Windows and macOS, when it runs, then payload verification passes on each.

## 🔧 Technical Notes

- Portable manifest fields and their checks live in `packages/core/src/index.ts`; the Claude manifest is built and checked in `packages/adapter-claude/src/index.ts`; the marketplace is merged in `packages/adapter-claude/src/tooling.ts`.
- The official validator runs from `packages/adapter-claude/scripts/payload.mjs`, the release edge, and CI pins Claude Code 2.1.318.
- The Claude adapter version stays 1.0.0: installation validates downloaded release bundles with the current adapter, so a new version would make every earlier release unreadable.
- The approved approach is `approach-user-story-133-claude-payloads-pass-claude-code-s-official-validator.md` in this folder.

## 📊 Complexity

**3 points** — Largest driver: Scope=medium (two packages, three manifests, CI), Uncertainty=low (behaviour defined by Claude Code's reference), Integrations=medium (Claude Code CLI in CI), Data=low (optional manifest fields), QA=medium (legacy bundles and three CI runners), Rollout=low (no user action) → 3 points

## 📄 Original Description

> # Claude payloads pass Claude Code's official validator
>
> Spec: \[\[Specs/spec-claude-payload-validation\]\]
>
> The Claude Code plugins and marketplace that UPF generates pass `claude plugin validate`, but with warnings: no author, no license, no marketplace description. The manifest also repeats default component paths that Claude Code loads on its own. This story fills those gaps and makes the build run Claude Code's own validator, so a future spec change is caught before release.
>
> ## Requirements
>
> * Portable plugin manifests accept an optional `author` (a non-empty name, plus optional email and URL) and an optional `license` (SPDX id). Malformed values are reported like other manifest fields.
> * The Claude adapter copies `author` and `license` into `.claude-plugin/plugin.json`.
> * The Claude adapter no longer declares `skills`, `hooks` or `mcpServers` when they point at their default locations. Bundles from earlier releases that declared them still pass the adapter's validation.
> * The shipped plugins (hello-world, unified-plugin-framework, project-knowledge) declare Monolith-INC as author and Apache-2.0 as license.
> * The project marketplace written during setup has a description. A description the user wrote is kept, and an existing marketplace without one gains it on the next setup run.
> * `payload:verify` for Claude runs `claude plugin validate --strict` on every built payload. A warning, an error or a missing Claude Code CLI fails verification, with an instruction to install the CLI or set `CLAUDE_CODE_CLI`.
> * CI installs a pinned Claude Code CLI before payload verification.
>
> ## Acceptance Criteria
>
> - [ ] Every shipped Claude payload passes `claude plugin validate --strict`.
> - [ ] A payload built before this change (no author) fails the strict check, showing the check catches what it should.
> - [ ] A bundle that declares the default component paths still validates; one that declares a different path does not.
> - [ ] The marketplace merge adds a description to a new or older catalog and keeps a user's own.
> - [ ] CI passes on Ubuntu, Windows and macOS.

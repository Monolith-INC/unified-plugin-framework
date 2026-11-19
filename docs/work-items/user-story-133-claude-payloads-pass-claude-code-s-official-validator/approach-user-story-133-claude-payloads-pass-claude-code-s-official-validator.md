---
title: "Claude payloads pass Claude Code's official validator"
type: 'approach'
ticket: 'AGE-133'
created: '2026-11-19'
status: 'draft'
route: 'full'
route_source: 'pinned'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** UPF's generated Claude Code plugins and project marketplace pass `claude plugin validate` only with warnings (no author, no license, no marketplace description), and the manifest repeats default component paths Claude Code already loads. Nothing in the build runs Claude Code's own validator, so a change in Claude Code's plugin format would first show up on a user's machine.

**Approach:** Carry an optional `author` and `license` from the portable manifest into the Claude manifest, stop declaring default component paths while still accepting them in released bundles, give the project marketplace a description, and make the Claude `payload:verify` run `claude plugin validate --strict` on every built payload, with a pinned Claude Code CLI in CI.

## Boundaries & Constraints

**Always:** Bundles from earlier releases keep validating. Pure planning stays separate from effects; the validator call lives only in the payload script, the edge. A user's own marketplace description is kept. Every failure tells the reader how to recover.

**Never:** Hard-code author or license in the adapter. Skip the official check silently when the CLI is missing. Bump the Claude adapter version, which would make older release bundles unreadable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Author and license present | Portable manifest with `author` and `license` | Both appear in `.claude-plugin/plugin.json` | No error expected |
| Malformed author | `author` is a string, has an empty name, a non-string contact or an extra key | Manifest diagnostic `manifest.author.invalid`; author omitted | Reported like other manifest fields |
| Released bundle | Claude manifest declares `skills: "./skills/"`, `hooks`, `mcpServers` at defaults | Bundle validates | No error expected |
| Wrong component path | Claude manifest declares `skills: "./elsewhere/"` | `claude.manifest.component` diagnostic | Bundle rejected |
| Older catalog | Project marketplace without `description` | Next setup run writes the default description | No error expected |
| User's catalog | Marketplace with the user's own description | Left unchanged | No error expected |
| CLI missing | `claude` not on PATH | `payload:verify` fails | Message says to install the CLI or set `CLAUDE_CODE_CLI` |
| Validator warning | Payload without author | `payload:verify` fails under `--strict` | Validator output reported per plugin |

</frozen-after-approval>

## Code Map

- `packages/core/src/index.ts` -- `PluginManifest`, `PORTABLE_MANIFEST_FIELDS`, `readManifest`, new `readAuthor`; diagnostic codes `manifest.author.invalid`, `manifest.license.invalid_type`.
- `packages/adapter-claude/src/index.ts` -- `compileClaudePayload` builds the manifest; `validateManifest` checks it; new `hasAuthorName`.
- `packages/adapter-claude/src/tooling.ts` -- `mergeClaudeMarketplace` writes the project catalog.
- `packages/adapter-claude/scripts/payload.mjs` -- release edge for `payload:build` and `payload:verify`; runs the official validator.
- `.github/workflows/ci.yml` -- quality job; installs the pinned CLI before payload verification.
- `plugins/{hello-world,project-knowledge,unified-plugin-framework}/plugin.json` -- shipped manifests.
- `docs/quality-gates.md`, `docs/vendor-payload-installation.md` -- describe `payloads:verify`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/index.ts` -- add optional `author` and `license` to the portable manifest with validation -- the portable source is where plugin metadata belongs.
- [ ] `packages/adapter-claude/src/index.ts` -- emit `author` and `license`; drop default component declarations; accept them in released bundles -- matches Claude Code's manifest reference.
- [ ] `packages/adapter-claude/src/tooling.ts` -- add a marketplace description, keeping a user's own -- removes the marketplace warning.
- [ ] `plugins/*/plugin.json` -- declare Monolith-INC and Apache-2.0 for the three shipped plugins -- strict validation needs an author.
- [ ] `packages/adapter-claude/scripts/payload.mjs`, `.github/workflows/ci.yml` -- run `claude plugin validate --strict` on each built payload; install Claude Code 2.1.318 in CI -- makes Claude Code the authority in the build.
- [ ] `packages/core/test/inspection.test.mjs`, `packages/adapter-claude/test/*.test.mjs` -- cover every matrix row except the CLI and validator rows, which the payload script exercises.
- [ ] `docs/quality-gates.md`, `docs/vendor-payload-installation.md` -- document the CLI requirement.

**Acceptance Criteria:**
- Given the shipped plugins, when `payload:verify` runs for Claude, then every payload passes `claude plugin validate --strict`.
- Given a payload built before this change, when the strict validator runs, then it fails, showing the check catches a missing author.
- Given the CI quality job on Ubuntu, Windows and macOS, when it runs, then payload verification passes on each.

## Design Notes

The adapter version stays 1.0.0 because installation validates downloaded release bundles with the current adapter; a new version would make every earlier release unreadable. Accepting default-path declarations keeps those bundles valid. The CLI version is pinned to a release at least two weeks old so a Claude Code update cannot change CI's verdict between runs.

## Verification

**Commands:**
- `node ~/.claude/scripts/suite-without-types.mjs .` -- expected: every test and `payload:verify` step passes.
- `pnpm --filter @agent-plugins/cli build` -- expected: type-checks every package that reads the manifest type.
- `claude plugin validate --strict <old payload without author>` -- expected: exit 1.

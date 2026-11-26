---
type: task-check-evidence
story: AGE-196
status: active
---

# AGE-203 staging verification

The delivery candidate is `511e1c3989db0cb220ab1dde84871ad759a08452` in a clean Linux checkout, with Node 24.19.0 and pnpm 10.14.0. The live Codex terminal test used Codex 0.171.0 and the same runtime code. The candidate adds the redacted handoff evidence to that code.

- Frozen offline install, build, type checking, 23 Python hook tests, shell branch tests, and the whitespace check passed.
- Nine package test suites passed in the initial run. The CLI suite failed there and then passed on the unchanged revision with host access: 237 tests passed, six Windows-only tests were skipped, and none failed.
- Payload verification initially could not run the official Claude validator. The unchanged candidate passed payload verification for Claude Code, Codex, and Cursor with host access.

The live handoff remains verified on the Codex terminal surface. The package checks do not substitute for the separate live Claude Code and Cursor validation.

## Candidate after review fixes

The revised candidate is `913ccdec1823b07dfd0fa139ab49e006c88b1ef2`. Verification ran in the clean Linux delivery checkout, with Node 24.19.0 and pnpm 10.14.0. Frozen offline install, build, type checking, all package suites, payload verification for Claude Code, Codex and Cursor, 23 Python hook tests, shell branch checks and the whitespace check passed. The CLI suite recorded 237 passes and six Windows-only skips. During the package pass, two assertions still expected wording that the review fixes replaced. After updating the installed-skill assertion and retaining the explicit consent wording, both affected suites passed.

The automated checks exercise the installed discovery instructions and MCP form exchange. The earlier live trace remains evidence for the direct-tool path. The revised candidate also needs a live check starting from the assembled discovery skill.

## Final verification

The live Codex CLI run from the assembled skill returned `ready`, `conversation`, occurrence `1` after the native user choice. The initial request used a language name and recovered on the same state before opening the form. Final candidate `9534763069d0e198ce82e0ed74d2592e4a924c47` clarifies the language tag in the tool schema and generated instructions. Workflow, Codex adapter and CLI suites passed on that revision, with 125, 16 and 237 passing tests respectively and six Windows-only skips. All three payloads and the branch diff check passed again. The remaining package and hook checks ran before this wording-only clarification.

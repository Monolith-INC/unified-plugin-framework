---
type: verification-plan
story: AGE-154
status: active
---

# Verification plan: guided interaction

## First delivery: Codex project configuration

Run focused tests for default-off consent, explicit opt-in, existing true and false values, unchanged unrelated settings and repeated setup. Test valid TOML with quoted and dotted keys, inline tables, comments, multiline strings, different line endings, dates and nonfinite numbers. Invalid or unsupported input must leave the file unchanged.

Test linked paths, directories, FIFOs, permission failures and concurrent edits. A failed or unsafe read or write must not modify another target or wait indefinitely. Test that an unavailable structured control is distinct from an unavailable reply channel; the latter yields needs-input without reading stdin or performing the protected action.

Record the Codex version and observations for trusted and untrusted projects, existing and new sessions, and noninteractive execution. Do not change project trust to make the check pass. State any observation that cannot be obtained.

## Later deliveries

Verify native and fallback choices, custom answers and consent; storyboard reachability and deterministic next steps; invalid, repeated and late events; pause and recovery; catalog identifiers and saved language; and blueprint assembly, readable fallback and revision-bound review. Follow the seven existing tasks in order.

## Delivery checks

Run focused tests against compiled JavaScript without TypeScript checking during test execution. Before push, run the repository's required full checks once, with type checking separate from tests, plus applicable payload, specification and hook checks. Review the changes as required by the repository and record any missing live-host evidence. Preserve unrelated work and dependency source files.

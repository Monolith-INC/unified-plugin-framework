---
type: task-check-evidence
story: AGE-196
status: active
---

# AGE-198 verification

The AGE-198 delivery commit is `3e8b162`. Shared presentation now prepares the same choice order that its numbered renderer shows. Existing callers that supply their own display order keep it. Fixed choices decode to stable IDs, custom input stays literal, and approval-like text cannot stand in for an explicit confirmation choice.

Two regressions reproduced the mismatch before the fix. After it, the CLI build and four focused test files passed: question channel, question rendering, discovery continuation, and CLI question command. Tests covered reordered choices, numbered confirmation, literal custom input, and existing caller-supplied order. The staged diff passed the whitespace check.

This verifies the shared contract. The Codex adapter and the live handoff are later tasks.

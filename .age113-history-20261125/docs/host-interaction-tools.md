# Host Interactive Question Tools

Unified Plugin Framework workflows ask fixed-answer questions (single choice, multiple choice, and consent) through each host's native structured selection tool when available, falling back to a numbered list ending with **Other (type your own answer)** when unavailable (`SHARED_INTERACTION_SECTION` in `packages/workflows/src/questions.ts`).

This reference records the native "ask the user a question" tool on each supported or tracked host, its availability rules, and any host configuration required to activate it.

## Host Comparison

| Host | Tool Name | Availability | Schema / Limits | Multi-select & "Other" |
| --- | --- | --- | --- | --- |
| **Claude Code** | `AskUserQuestion` | Always available in interactive sessions (disabled in `-p` headless mode) | `questions` (1–4 items); each item has `question`, `header` (max 12 chars), `options` (2–4 `{ label, description }`), `multiSelect` | Native `multiSelect: true/false`; UI automatically appends an **Other** free-text option |
| **OpenAI Codex** | `request_user_input` | **Plan Mode only by default.** In Default/Code mode it requires `[features] default_mode_request_user_input = true` (disabled in `codex exec`) | `questions[]` with `header`/`question`, `options[]` (`{ label, description }`), optional free-text | Single-choice picker per question + custom text input |
| **Cursor** | `AskQuestion` | Interactive Agent / Plan Mode in the IDE (model-dependent; unavailable in headless `cursor-agent -p` or cloud agents) | Structured clickable cards (radio, checkbox, confirm) | Single & multi-select depending on model/UI |
| **Antigravity (AGY)** | `ask_question` | Interactive sessions | `questions[]` with `question`, `options: string[]` (unnumbered; recommended first prefixed `(Recommended)`), `is_multi_select` | Native `is_multi_select: true/false`; UI automatically adds numbering and **Other** |

## Codex Project Configuration (`.codex/config.toml`)

Verified empirically against `codex-cli 0.171.0`:

- By default, `codex features list` reports:
  ```text
  default_mode_request_user_input          under development  false
  ```
- Adding the following to the project's `.codex/config.toml` enables `request_user_input` in Default/Code mode (not just Plan Mode) once the project is trusted in `~/.codex/config.toml` (`trust_level = "trusted"`):
  ```toml
  [features]
  default_mode_request_user_input = true
  ```
- Verified inside a trusted project directory with `.codex/config.toml` present: `codex features list` reports `default_mode_request_user_input` as **`true`**.
- For untrusted directories, Codex ignores project-level `.codex/config.toml` until the user trusts the project (or sets the same `[features]` entry in `~/.codex/config.toml` or launches with `codex --enable default_mode_request_user_input`).

## Implications for UPF Workflows

- **Group size cap (`4` options):** `groupOptions()` in `packages/workflows/src/questions.ts` chunks long lists (such as the Discovery optional-skills catalog) into groups of at most 4 options to satisfy Claude Code's `AskUserQuestion` 2–4 option schema constraint while remaining compact in Codex, Cursor, and Antigravity.
- **Numbered fallback:** When running in Codex Default mode without `default_mode_request_user_input = true`, or in headless/non-interactive runs where native question tools are stripped, workflows fall back cleanly to numbered lists ending with **Other (type your own answer)**.
- **Candidate future installer enhancement:** When materializing Codex project files, UPF can optionally merge `default_mode_request_user_input = true` into `.codex/config.toml` (preserving all user settings) once the flag stabilizes or is explicitly opted into.

See also [monolithic-dev-harness-patterns.md](monolithic-dev-harness-patterns.md) for how a sibling harness enforces question tools, orients agents by workflow state, and drives turn end with a next step.

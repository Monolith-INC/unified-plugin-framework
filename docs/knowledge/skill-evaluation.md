# Standalone skill walkthrough evaluation

These outcomes come from a static walkthrough of the setup and discovery instructions against the prompts in `runtimes/project-knowledge/tests/fixtures/skill-cases.md`. No model conversations were run, so this report does not establish conversational behavior.

| Case | Observed outcome in the written instructions |
| --- | --- |
| Empty project | Setup proposes `.project-knowledge/knowledge`, `docs/`, and `Codex/`, requests acceptance, then writes only accepted configuration and the knowledge directory. |
| Existing review root | Setup prefers an existing configured root and reuses document locations where present; legacy settings are read to identify a root. |
| Conflicting roots | Setup and discovery stop and ask the user to choose; neither merges roots automatically. |
| User accepts defaults | Setup persists `schemaVersion`, `knowledgeRoot`, `documentMode`, `docsRoot`, and `vaultRoot`, preserving unrelated configuration keys. |
| Human-authored rule becomes stale | Discovery flags a possible stale stated unit and asks the user to review it instead of replacing it silently. |
| Unsupported platform | Runtime documentation says Linux/macOS only and explicitly marks Windows unsupported. The skills themselves do not perform platform checks. |

The written procedure covers the expected decisions. Follow-up behavioral evaluation should run the prompts through an agent that has the skills installed.

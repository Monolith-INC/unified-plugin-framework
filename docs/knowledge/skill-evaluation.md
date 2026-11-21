# Standalone skill walkthrough evaluation

These outcomes summarize the static walkthrough of the `monolithic-agent-knowledge-store` (`v0.4.1`) setup and discovery instructions (retired legacy `runtimes/project-knowledge` fixtures were superseded by the standalone plugin's test suite and `docs/host-qualification.md`).

| Case | Observed outcome in the written instructions |
| --- | --- |
| Empty project | Setup proposes `Project_Knowledge/` and `project-knowledge.json`, requests acceptance, then writes only accepted configuration and the knowledge directory. |
| Existing review root | Setup prefers an existing configured root and reuses document locations where present; legacy `.project-knowledge.json` settings are read to identify a root. |
| Conflicting roots | Setup and discovery stop and ask the user to choose; neither merges roots automatically. |
| User accepts defaults | Setup persists `schemaVersion`, `knowledgeRoot`, `documentMode`, `docsRoot`, and `vaultRoot`, preserving unrelated configuration keys. |
| Human-authored rule becomes stale | Discovery flags a possible stale stated unit and asks the user to review it instead of replacing it silently. |
| Cross-platform support | Standalone `monolithic-agent-knowledge-store` (`v0.4.1`) uses stdlib Python 3.12+ and is verified on Linux, macOS, and native Windows. |

See [qualification.md](qualification.md) for verified CI evidence and release history.

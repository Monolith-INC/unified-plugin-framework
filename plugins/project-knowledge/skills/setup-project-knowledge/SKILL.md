---
name: setup-project-knowledge
description: Configure the shared project knowledge store location and document layout before discovery or runtime use.
---

# Set Up Project Knowledge

Set up one shared knowledge store for the target project. Do not assume the review plugin is installed, register host tools, or create a complete knowledge vault.

## Choose the root

Read `.project-knowledge.json` if present, and inspect the legacy `.monolithic-code-review/sources.json` only to identify an existing root. If the settings identify different roots, stop and ask which root to use; never merge them automatically. Prefer an existing configured root. Otherwise propose `.project-knowledge/knowledge` under the project. If a selected configured root is absent or unreadable, report that condition and ask how to proceed; do not silently choose another root.

## Choose document locations

Ask whether documents should share the knowledge root (recommended and the default) or use separate locations. For shared documents, prefer an existing configured docs or vault location when present; otherwise propose `docs/` for `docsRoot` and `Codex/` for `vaultRoot`. For separate documents, likewise reuse existing locations when present, otherwise propose those same paths. Explain each proposed path and ask the user to accept or adjust it. These path defaults are proposals, not observed project facts.

## Save accepted settings

After acceptance, preserve unrelated keys and write `.project-knowledge.json` with `schemaVersion: 1`, `knowledgeRoot`, `documentMode` (`shared` or `separate`), `docsRoot`, and `vaultRoot`. Resolve relative paths from the project directory. Create only the accepted knowledge directory and this configuration file. Do not create a whole vault or register server tools.

Keep user decisions, observed facts, proposals, and unresolved questions distinct. If the user declines a proposed default, ask for a replacement path before writing.

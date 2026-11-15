---
name: setup-project-knowledge
description: Configure the shared project knowledge store location and document layout before discovery or runtime use.
---

# Set Up Project Knowledge

Set up one shared knowledge store for the target project. Do not assume the review plugin is installed, register host tools, or create a complete knowledge vault.

## Choose the root

Read `.project-knowledge.json` if present, and inspect the legacy `.monolithic-code-review/sources.json` only to identify an existing root. If the owned and legacy settings name different roots, explain that ordinary runtime use will continue to reject the conflict. The supported persistent resolution in this setup is to select the legacy root and save it as `knowledgeRoot`; do not silently change legacy settings. If the user wants another root, explain that they must direct legacy-setting reconciliation outside this setup, then recheck both settings before declaring configuration complete. Never merge roots automatically. Prefer an existing configured root. Otherwise propose `.project-knowledge/knowledge` under the project. If a selected configured root is absent or unreadable, report that condition and ask how to proceed; do not silently choose another root.

## Choose document locations

Ask whether developer documentation and vault artifacts should share one set of original documents or live separately. Keep `knowledgeRoot` independent: it stores the optimized knowledge representation, not those originals. Reuse an existing `documentMode` as the proposed default; otherwise propose `shared`. In shared mode, set both `docsRoot` and `vaultRoot` to the same existing matching root, or to `docs/` if none exists. In separate mode, reuse existing locations where present; otherwise propose `docs/` and `Codex/` respectively. Explain the path relationship and ask the user to accept or adjust it. These defaults are proposals, not observed project facts.

## Save accepted settings

After acceptance, preserve unrelated keys and write `.project-knowledge.json` with `schemaVersion: 1`, `knowledgeRoot`, `documentMode` (`shared` or `separate`), `docsRoot`, and `vaultRoot`. Resolve relative paths from the project directory. Create only the accepted knowledge directory and this configuration file. Do not create a whole vault or register server tools.

Keep user decisions, observed facts, proposals, and unresolved questions distinct. If the user declines a proposed default, ask for a replacement path before writing.

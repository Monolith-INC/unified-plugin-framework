---
name: knowledge-discover
description: Populate and curate the project's shared five-tier knowledge store from verified repository sources. Part of the Knowledge workflow (contract v1).
---
{{generated}}

# Knowledge — Discover

Inspect repository evidence and curate source-backed units into the shared five-tier project knowledge store through its version-checked write path. Never leave `catalog.tsv` empty or overwrite authored decisions without provenance.

{{readiness}}

## Curation standards

1. **Use the active `query.py` with subcommand-first arguments:** run `python3.12 <plugin-root>/scripts/query.py <subcommand> --project <project-root> ...` (in a UPF project, `<plugin-root>` is `.upf-tools/plugins/monolithic-agent-knowledge-store/source` or the host's active plugin cache path). Never place `--root` or `--project` before the subcommand.
2. **Preserve `project-knowledge.json`:** when `project-knowledge.json` already exists, do **not** run `query.py setup` (it strips UPF's `documentMode`, `docsRoot` and `vaultRoot` fields); curate directly into the configured `knowledgeRoot`.
3. **Cover all five tiers thoroughly from real sources:** inspect README, `docs/**`, package/build manifests, linter/analyzer configs, source modules, tests, and local backlog/idea files. Use integer `--tier` values `1`–`5` (`1` identity, `2` structure, `3` mechanics, `4` rules, `5` evolution) and hierarchical unit IDs (such as `identity/purpose`, `structure/architecture`, `mechanics/stack`, `mechanics/testing`, `rules/coding-standards`, `evolution/backlog`). Do not stop at minimal one-sentence stubs when richer verified evidence exists.
4. **Write high-signal metadata and provenance:** give each unit a human-readable `--title`, an accurate `--type` and `--area`, and a specific `--read-when` routing cue (never generic placeholders like `"working on this project"` or raw slug titles). Distinguish `--direction stated` (explicit human-authored docs, vision, guardrails) from `--direction derived` (code structure, manifests, analyzer rules, tests). Pass repeatable `--source <path>` with `--verify-sources`, connect related units with repeatable `--link <unit-id>`, and record key domain terms with `query.py curate-glossary`.
5. **Verify before finishing:** run `validate-lineage`, `manual-refresh`, and `catalog` via `query.py` to confirm every unit is indexed, sourced, and conflict-free.

## Run discovery

{{delegate}}

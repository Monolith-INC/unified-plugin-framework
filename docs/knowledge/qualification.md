# Project Knowledge Qualification

Project Knowledge is qualified via the standalone repository **[Monolith-INC/monolithic-agent-knowledge-store](https://github.com/Monolith-INC/monolithic-agent-knowledge-store)** (`v0.3.0`), pinned in `io.github.monolith-inc.upf/onboarded.lock.json`.

## Verified Releases & CI Evidence

- **Upstream engine:** `Monolith-INC/monolithic-code-review-toolkit` commit `7461aed54f12c050fcff4cb70998d23206721d25` (portable `knowledge-write.lock` on Linux, macOS, and native Windows; `ReadView` projected reads; SHA-256 verified by `tests/test_provenance.py`).
- **Standalone plugin releases:**
  - `v0.1.0` — store, setup, migration, curation, lineage validation, projected retrieval (`52` upstream + `11` owned tests green on Ubuntu, macOS, Windows Python 3.12).
  - `v0.2.0` — agent wiring hooks (`orient`, `inject`, `gate`, `session-end`), default-branch & non-Git refresh, host qualification matrix (`docs/host-qualification.md`), installer (`scripts/install.sh`), and GitHub Release packaging ([Run `44877821971`](https://github.com/Monolith-INC/monolithic-agent-knowledge-store/actions/runs/44877821971), `52` upstream + `16` owned tests green on Ubuntu, macOS, Windows Python 3.12).
  - `v0.3.0` — `ingest-docs`, `publish-docs`, `apply-doc-patch`, and append-only `flow-log.jsonl` recovery ([Release `v0.3.0`](https://github.com/Monolith-INC/monolithic-agent-knowledge-store/releases/tag/v0.3.0), [Run `44878821240`](https://github.com/Monolith-INC/monolithic-agent-knowledge-store/actions/runs/44878821240), `52` upstream + `19` owned tests green on Ubuntu, macOS, Windows Python 3.12).

## Host Coverage & Unsupported Surfaces

Per-action host coverage across **Claude Code**, **Codex**, and **Cursor** (including explicit **instructions-only** reporting for unsupported host hook surfaces) is maintained in `docs/host-qualification.md` inside `monolithic-agent-knowledge-store`.

## Retired Legacy Surface

- Removed embedded `plugins/project-knowledge/` and `runtimes/project-knowledge/`.
- Retired the UPF knowledge MCP server transport and private Python venv provisioning in favor of user-provided Python 3.12+ and stdlib-only scripts.

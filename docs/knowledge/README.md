# Project Knowledge Store

Project Knowledge is delivered as a standalone, zero-MCP, Agent Plugins Specification v1.0.0 plugin:
**[Monolith-INC/monolithic-agent-knowledge-store](https://github.com/Monolith-INC/monolithic-agent-knowledge-store)** (`v0.4.1`), onboarded into Unified Plugin Framework under the `knowledge` workflow adapter (`io.github.monolith-inc.upf/onboarded.lock.json`).

## Architecture

- **Zero MCP & stdlib Python 3.12+ only:** No MCP server, no virtual environment, and no third-party Python dependencies. Agents invoke `scripts/query.py` directly using user-provided Python 3.12+.
- **Upstream engine preserved unchanged:** Vendors `Monolith-INC/monolithic-code-review-toolkit` commit `7461aed54f12c050fcff4cb70998d23206721d25` with portable `knowledge-write.lock` locking (Linux, macOS, and native Windows) and `ReadView` projected reads.
- **Single visible store & locator:** Defaults to `Project_Knowledge/` and `project-knowledge.json` (with legacy `.project-knowledge.json` read compatibility). Conflicting store locations fail explicitly rather than creating a second store.
- **Full lifecycle skills:**
  - `setup-project-knowledge` — visible store setup, custom paths, local-only option, and verified legacy migration
  - `discover-project-knowledge` — source-backed five-tier discovery
  - `query-project-knowledge` — projected current-only `find`/`fetch`, `catalog`, `glossary`, `links`, and `--history`
  - `refresh-project-knowledge` — default-branch refresh handoff and non-Git manual refresh
  - `ingest-docs` — quote people-owned passages while skipping generated regions and preserving external edits
  - `publish-docs` — checked, revalidated patches into explicit `<!-- maks:region ... -->` markers with append-only `flow-log.jsonl` recovery

See [qualification results](qualification.md) for verified Linux, macOS, and Windows test evidence and host coverage.

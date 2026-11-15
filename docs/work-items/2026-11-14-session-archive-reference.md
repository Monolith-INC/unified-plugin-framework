# Session archive plan

> Reference material for Plan D (session archival); not an approved plan for this repository. It was written for the Agent Continuity plugin: file paths and "pull request #2" refer to that project, not this one. Where it differs from `unified-plugin-framework-draft-plan.md`, the draft plan wins; in particular `Knowledge/Session_Decisions.md` indexes decisions and does not copy their text.

Nov 14, 2026 · @Théo Carranza

## Goal

Keep `Agent_Sessions/` lean. Only a few records stay as plain files ready to read. Older records move into a compressed archive that git tracks, so nothing is lost. Before a record is archived, what is worth keeping is copied into the vault's knowledge notes, so the archive is rarely opened.

This builds on the session index from pull request #2 and is separate from the two pending additions, the task-list reminder and the backup cleanup, which still need approval.

## How it works

```mermaid
flowchart LR
  R[Record older than the newest 10] --> D[Distill: copy decisions and lessons to knowledge notes]
  D --> M[Mark record distilled]
  M --> A[Pack into the month's compressed file]
  A --> F[One-line entry in the tracked manifest]
  F --> I[Session index lists it as archived]
  I -->|on demand| U[Unpack only that record]
```

1. **What stays ready to read.** The newest 10 records (setting `vault.archive.keep`), plus the ongoing record and any record that cannot be read, which are never archived.
2. **Distill first.** A tool copies every `## Decision` entry from the record into `Knowledge/Session_Decisions.md`, each with a link back to its record. The agent then reviews the record for anything else worth keeping, such as lessons, patterns or a decision big enough for an `Architecture/ADR/` note, and writes it there. The record gets `distilled: true` in its frontmatter. Only distilled records can be archived.
3. **Pack.** Archived records go into one compressed file per month: `Agent_Sessions/Archive/2026-11.tar.gz`. The file is built the same way every time, so git only stores a new version when its content really changes. The original file is deleted only after the packed copy is checked byte for byte.
4. **Manifest.** `Agent_Sessions/Archive/manifest.json`, tracked by git, holds one line per archived record: its name, title, status, which month file holds it, and a checksum. It travels with the repository, unlike the index, which is local to each machine.
5. **Index.** At session start, the index also loads the manifest, so finding a record by name works the same whether it is a plain file or archived.
6. **Unpack on demand.** `archive_sessions.py show <name>` prints one archived record without touching the folder. `archive_sessions.py restore <name>` puts it back as a plain file, and the next archive run packs it again.

## When it runs

- **On demand:** a new `archive-sessions` skill runs the whole flow: distill, review, pack.
- **Suggested at session start:** when more than 20 plain records exist (twice the keep setting), the start menu adds a one-line note asking the agent to offer an archive run. It is not automatic, because the distill step needs the agent's judgment.

## What changes in the code

- `hooks/scripts/archive_sessions.py` (new): `distill`, `pack`, `show` and `restore` commands, using only Python's standard library.
- `hooks/scripts/registry.py`: read the manifest into the index, and add a lookup that covers archived records.
- `hooks/scripts/session_options.py`: the note suggesting an archive run.
- `skills/archive-sessions/SKILL.md` (new).
- `archetypes/software-project.json`: `distilled` becomes an optional key for session records, and `Agent_Sessions/Archive` is a known folder.
- `scripts/vault-lint.py`: treat the archive folder as expected.
- Docs: `init-workspace` session rules, README, CHANGELOG.
- Tests written first for each command and for the index lookup.

## Trade-offs

- **Broken links in Obsidian.** A link to an archived record stops opening in Obsidian. The agent can still find the record through the manifest and unpack it. I recommend not leaving small placeholder files, because they would undo the point of keeping the folder lean.
- **Binary files in git.** The month files are binary, but small: text compresses well, and a month of records is likely tens of kilobytes. Rewrites happen only when a month gains or loses records.

## Decisions for you

1. **How many records stay ready to read?** I suggest 10.
2. **Should archiving be suggested or automatic** for records that are already distilled? I suggest suggested.
3. **Where do distilled decisions go?** I suggest a single `Knowledge/Session_Decisions.md`, with big ones promoted to `Architecture/ADR/`.
4. **Same pull request or a new one?** I suggest a new one, because pull request #2 is already large.

## Codex context

There is no single vault to check. The archive works in whatever project the plugin is installed in, so the plan is grounded in what every vault shares: the `software-project` archetype (which defines `Agent_Sessions/` as a doubly linked chain and `Knowledge/` for distilled notes), `references/frontmatter-convention.md` (session status lives in frontmatter), and the `mine-bases` dashboard over `Agent_Sessions/`. Two consequences: the archive must not depend on anything one project has and another lacks, and the dashboard must keep working for the records that stay ready to read.

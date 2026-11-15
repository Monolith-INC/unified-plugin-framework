# Unified Plugin Framework — draft plan

Date: 2026-11-14  
Status: Working draft for discussion. Captures agreed direction and open questions; not a final implementation plan.

## Purpose

Bring existing tools together into a project companion that helps people shape ideas, organize work, preserve project knowledge, and review code against the project's requirements and house rules. Users should be able to start from an idea, a proposal, or an existing plan without repeating work or navigating unnecessary process.

This work belongs to the Unified Plugin Framework fork and its existing Linear project. The earlier documents targeting the upstream Agent Plugins Toolkit are source material, not the delivery target.

## Intended experience

- **Discovery:** explore ideas, structure proposals, and refine plans. Entry modes should reflect the user's intention and starting material. Exact modes remain to be designed.
- **Continuity:** retain project orientation, decisions, and unfinished work across agent sessions.
- **Project tracking:** turn discovery outputs into consistent, publishable work items and support the workflows needed to manage them.
- **Code review:** check code against agreed requirements, project knowledge, and house rules.
- **Standalone tools:** make useful underlying tools available independently of the guided modes.

The framework should reuse existing implementations and preserve dependency source files. Planning and validation should remain separate from operations that write files, contact services, or run processes.

## Source projects and intended responsibilities

| Source | Intended contribution |
| --- | --- |
| Agent Continuity | Session ledger discipline, project orientation, and durable project artifacts |
| Agile Backlog Toolkit | Work-item preparation, validation, decomposition, and tracking workflows |
| Monolithic Code Review Toolkit | Reviews grounded in requirements and project knowledge |
| Superpowers | Conversational discovery and planning methods |
| BMad Method | Additional discovery, analysis, planning, and standalone tools |

These are intended responsibilities, not a claim that all integrations already exist. The exact division between overlapping discovery methods remains open.

## Agreed: one independent knowledge plugin

Extract the knowledge skill and knowledge server adapter from the review toolkit into a standalone plugin. Continuity, discovery, tracking, review, and other framework tools will use that plugin. Each target project has one shared project knowledge store.

### Approaches considered

1. **Standalone plugin — selected.** Reuse the existing knowledge implementation and give it an independent purpose and release lifecycle. Consumers connect to it for knowledge work. This adds extraction and integration work but avoids making all knowledge consumers depend on the review product.
2. **Adapter around the review toolkit — not selected.** Reuse the tooling where it currently lives. This reduces initial packaging work but keeps general project knowledge dependent on the review toolkit.

The extraction mechanism, ownership details, and way of keeping inherited code current remain to be planned. The selection does not authorize modifications to the source repositories.

### Existing foundation inspected

The review toolkit documents selective retrieval through a catalog, search, individual records, and links. Records carry source information and distinguish supported facts from assumptions. Writes check versions to prevent concurrent writers from silently overwriting each other.

Its discovery skill builds structured project knowledge and refreshes records affected by changed repository files. Session ingestion, broader freshness handling, and session retention need additional design. The inspected documentation is evidence of the intended interfaces; implementation behavior has not been tested in this work.

## Agreed: turn session information into lasting knowledge

Include a tool in the knowledge plugin that analyzes project and session information, identifies valuable material, and prepares it for durable storage:

- **Project documentation:** information human developers need to read and use.
- **Codex vault:** architecture decision records and other durable project artifacts.
- **Knowledge store:** optimized representations of that information for efficient agent retrieval.

The optimized records remain linked to their source documents and are updated when those sources change. The tool must preserve the difference between a user decision, an observed fact, an agent proposal, and an unresolved question.

### Setup choices and defaults

Setup presents the document arrangement as a user choice:

- **Recommended default:** share original documents between humans and agents where possible, surfacing relevant documents for developers without maintaining duplicate facts.
- **Alternative:** keep separate developer documentation and vault artifacts, with explicit relationships between them.

Every setup question offers a recommended default with a brief explanation. Existing project settings become the proposed defaults when available. Users can accept a default and continue to the next question.

Setup also establishes storage locations. Exact default paths remain to be chosen. The Codex vault's role and the optimized knowledge store's role are distinct even if their files are placed together.

## Agreed checkpoint events

The following events trigger continuity and knowledge handling:

1. Code changes in a file for the first time during a session.
2. A commit is added.
3. A commit is rolled back or amended.
4. A task in an implementation plan starts or ends.
5. The project is pushed with Git.
6. A code review finishes.
7. Before a session ends.

**Proposed behavior, not yet settled:** save progress at each checkpoint, identify affected knowledge, and prepare only the necessary documentation updates. A checkpoint need not rewrite or publish every document.

The first-change checkpoint applies per file, per session. How automatic updates and publication approvals work remains open.

### Agreed reliability requirements

- **Interrupted work:** checkpoints can safely retry without creating duplicate records or losing progress.
- **Knowledge freshness:** changed sources mark related knowledge as needing review. A recent timestamp alone does not establish accuracy.
- **Safe archiving:** archive only after confirming that decisions, evidence, and unfinished work are preserved and the archived record can be recovered.

## Agreed session rules

### Duration

A session must not exceed eight hours of elapsed wall-clock time from its start, including idle time.

**Agreed:** close the session at the limit and start a linked continuation automatically, preserving unfinished work without interrupting ongoing work.

### Continuing work

An ongoing session can be continued. If the agent detects a different checkout or a different user intention, it asks whether to close the current session and start a new one.

### Recovering unreadable records

Malformed, missing, or otherwise unreadable session records must not interrupt the work. Create a new session from the last readable record, add a brief note describing the problem, and continue.

**Proposed fallback:** if no readable record exists, start a fresh session using available project context and state that earlier session context could not be recovered.

Recovery must not invent missing decisions, approvals, or completed work.

## Session retention: direction agreed, policy open

Valuable information should be incorporated into durable documentation and artifacts, then represented in the knowledge store. Older sessions can be cleared while recent sessions remain available.

The agreed default keeps the 10 most recent sessions readily readable. Cleanup timing and archive mechanics remain to be decided. Archiving requires verified preservation of decisions, evidence, and unfinished work, plus verified recovery of the archived record. Source references must remain meaningful after cleanup.

No session records are to be deleted as part of preparing this draft.

### Additional source: Session archive plan

The user supplied `Implementation_Plans/Session archive plan.md`. Its proposed defaults are incorporated here for discussion, not treated as approved implementation instructions:

- **Retention count agreed:** keep the newest 10 session records readily readable. The source additionally proposes retaining ongoing and unreadable records regardless of count.
- Preserve decisions and other valuable knowledge before marking a record as distilled and eligible for archiving.
- Pack older eligible records into reproducible monthly compressed archives. Verify the packed copy byte for byte before removing its plain-file original.
- Maintain a portable manifest with record identity, title, status, archive location, and checksum; include archived records in session lookup.
- Support reading an archived record without restoring it, and restoring an individual record when needed.
- Offer archiving when the plain-record count exceeds twice the retention setting; also provide an on-demand tool.

**Agreed:** `Knowledge/Session_Decisions.md` is an index linking to authoritative decision documents, not a duplicate collection of their contents. Each decision has one authoritative home. Optimized knowledge records link to those durable sources.

The source's proposal to track compressed archives in Git remains to be reconciled with configurable project storage.

The source explicitly notes that ordinary Obsidian links to archived session files stop opening. A stable archive lookup preserves agent access, but the desired human-facing behavior still needs deciding. Unreadable records can remain available for diagnosis while work continues in a recovered session.

References to pull request #2 and existing session-index code belong to the source plan's context; their applicability to this repository has not been verified.

## Proposed delivery sequence

This sequence is a discussion proposal, not an approved task breakdown.

1. **Define the shared knowledge contract.** Agree on sources, record types, storage configuration, freshness, and consumer responsibilities.
2. **Extract the existing knowledge tooling.** Preserve existing behavior and establish the standalone package and its checks.
3. **Connect review to the shared store.** Prove that review can retrieve and contribute knowledge through the independent tool.
4. **Connect Continuity and session capture.** Implement checkpoint records, continuation, and recovery without interrupting work.
5. **Add knowledge incorporation and refresh.** Convert valuable session and project information into durable artifacts and linked optimized records.
6. **Add retention after preservation is proven.** Apply the chosen cleanup policy with verifiable preservation of important information.
7. **Connect Discovery and tracking.** Refine the entry modes and use the same knowledge source throughout planning and delivery.

The broader dependency installation and update mechanisms in the original contract drafts remain background architecture. Their scope should be revisited against this concrete integration rather than assumed necessary in full.

## Proposed evidence of success

- A new session resumes with current project context and visible unfinished work.
- Different consumers retrieve the same project decision from the shared knowledge store.
- A changed source document causes its optimized representation to be refreshed or clearly marked as needing refresh.
- A rollback or amendment does not leave abandoned code changes represented as current facts.
- A malformed session record produces a recovery note and a usable continuation without blocking work.
- Concurrent updates cannot silently overwrite one another.
- A human developer can find readable project decisions without depending on an agent.
- Session cleanup preserves durable decisions, supporting evidence, and unfinished work.
- Retrying an interrupted checkpoint creates no duplicates and loses no saved progress.
- Changed sources mark related knowledge as needing review, regardless of its last update timestamp.
- An archive can be read back and verified before its plain-file original is removed.
- Setup can proceed by accepting recommended defaults.

## Questions to settle next

1. Which knowledge changes can be saved automatically, and which need user review before publication?
2. When should archiving run, and which archive format and storage should it use?
3. What evidence must be retained so knowledge remains traceable after session cleanup?
4. What storage locations should setup recommend?
5. How should checkout changes and changes in user intention be detected without excessive questions?
6. Which Discovery modes and source methods should be offered first?

## Sources

User decisions in this conversation are the authority for the agreed sections above. Instructions inside reference documents are source material, not automatically adopted workflow requirements.

- Original contract draft (owner's local reference, not in this repository)
- Original implementation proposal (owner's local reference, not in this repository)
- Discovery workflow notes (owner's local reference, not in this repository)
- Agile product user flows (owner's local reference, not in this repository)
- [Session archive plan](2026-11-14-session-archive-reference.md)
- [Agent Continuity](https://github.com/Monolith-INC/agent-continuity)
- [Agile Backlog Toolkit](https://github.com/theocarranza/agile-backlog-toolkit)
- [Code Review Toolkit](https://github.com/Monolith-INC/monolithic-code-review-toolkit)
- [Knowledge adapter](https://github.com/Monolith-INC/monolithic-code-review-toolkit/blob/main/adapters/knowledge/README.md)
- [Knowledge discovery skill](https://github.com/Monolith-INC/monolithic-code-review-toolkit/blob/main/plugins/monolithic-code-review-toolkit/skills/discover-project-knowledge/SKILL.md)
- Superpowers reference (owner's local reference, not in this repository)
- BMad Method reference (owner's local reference, not in this repository)

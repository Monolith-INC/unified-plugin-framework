# Unified Plugin Framework — Core Functionalities

Date: 2026-11-15  
Status: Concrete product scope extracted from the working draft. Defines the functionality the plugin will deliver; does not claim implementation completion or settle the open design decisions below.

## Purpose and scope

Deliver a project companion that combines discovery, planning, project tracking,
code review, shared project knowledge, and continuity across agent sessions.
Users can start from an idea, a proposal, or an existing plan without repeating
work or navigating unnecessary process.

This is the concrete application of the Unified Plugin Framework to its core
user workflows. The general dependency resolver, capability broker, overlays,
and coordinated update machinery in the Unified Plugin Contract are supporting
architecture whose scope must be justified by these workflows.

Work belongs to the existing Unified Plugin Framework fork and Linear project
P-AGE-6. Reuse existing implementations, preserve dependency source files, and
keep pure planning and validation separate from filesystem, network, and process
effects.

## 1. Integrated workflows and standalone tools

| Functionality | User outcome | Intended source |
| --- | --- | --- |
| Discovery and planning | Explore ideas, structure proposals, and refine plans from the user's starting material. | Superpowers and BMad Method |
| Project tracking | Prepare, validate, decompose, and publish consistent work items; support their delivery workflows. | Agile Backlog Toolkit |
| Code review | Review code against requirements, project knowledge, and house rules. | Monolithic Code Review Toolkit |
| Continuity | Preserve project orientation, decisions, evidence, and unfinished work across sessions. | Agent Continuity |
| Standalone tools | Invoke useful underlying tools independently of guided workflows. | Relevant tools from the integrated sources |

The exact Discovery entry modes and division between overlapping methods remain
to be designed. The source assignments describe intended responsibilities,
not completed integrations.

## 2. Independent project knowledge plugin

Extract the knowledge skill and knowledge server adapter from the review toolkit
into a standalone plugin with its own purpose and release lifecycle. Reuse the
existing storage implementation rather than creating a parallel engine.

Each target project has **one shared project knowledge store**. Continuity,
discovery, tracking, review, and other framework tools use that same store.
General knowledge consumers do not need to depend on the review product.

Preserve selective retrieval through the catalog, search, individual records,
and links. Records retain source information and distinguish supported facts
from assumptions. Version-checked writes prevent concurrent writers from
silently overwriting one another.

## 3. Turn project and session information into lasting knowledge

Provide a tool that analyzes project and session information, identifies
valuable material, and prepares it for durable storage:

- **Project documentation:** readable information for human developers.
- **Codex vault:** architecture decisions and other durable project artifacts.
- **Knowledge store:** optimized representations for efficient agent retrieval,
  linked to their authoritative source documents.

Preserve the distinction between a user decision, an observed fact, an agent
proposal, and an unresolved question. Each decision has one authoritative home.
`Knowledge/Session_Decisions.md` is an index linking to decision documents,
not a duplicate collection of their contents.

Changes to source documents cause related knowledge to be refreshed or marked
as needing review. A recent timestamp alone does not establish accuracy.
Rollback or amendment must not leave abandoned changes represented as current
facts.

## 4. Setup with recommended defaults

Offer a recommended default, with a brief explanation, for every setup question.
Use existing project settings as the proposed defaults when available.

The recommended document arrangement shares authoritative documents between
humans and agents where possible, avoiding duplicate facts. An alternative keeps
developer documentation and vault artifacts separate with explicit relationships.

Setup establishes storage locations. The vault and optimized knowledge store
have distinct roles even when placed together. Exact default paths remain an
open design decision.

## 5. Continuity checkpoints

The following seven event kinds trigger continuity and knowledge handling:

1. The first code change to each file during a session.
2. A commit is added.
3. A commit is rolled back or amended.
4. An implementation-plan task starts or ends.
5. The project is pushed with Git.
6. A code review finishes.
7. Before a session ends.

Checkpoints must be safely retryable without duplicate records or lost progress.
The first-change checkpoint applies per file, per session.

The proposed checkpoint behavior is to save progress, identify affected knowledge,
and prepare only necessary documentation updates. That behavior, automatic
publication, and its approval policy remain to be settled; a checkpoint does
not inherently require rewriting or publishing every document.

## 6. Session lifecycle and recovery

Sessions last at most **eight hours of elapsed wall-clock time, including idle
time**. At the limit, close the session and automatically start a linked
continuation that preserves unfinished work without interrupting ongoing work.

Allow an ongoing session to continue. When the agent detects a different
checkout or user intention, ask whether to close the current session and start
a new one.

Malformed, missing, or unreadable session records must not block work. Recover
from the last readable record, create a new session, and record a brief diagnostic.
Never invent missing decisions, approvals, or completed work.

When no readable record exists, the proposed fallback is a fresh session using
available project context, explicitly noting the loss of earlier session context.
That fallback remains a proposal.

## 7. Session retention and safe archival

Keep the **10 most recent sessions readily readable** by default. Preserve
valuable information in authoritative documentation and durable artifacts, with
linked representations in the knowledge store.

Archive only after verifying preservation of decisions, supporting evidence,
and unfinished work, and verifying that the archived record can be recovered.
Source references must remain meaningful after cleanup.

Archive timing, format, storage, and human-facing links remain open. The archive
reference proposes monthly reproducible compressed archives, checksums and a
portable lookup manifest, individual read/restore operations, protection for
ongoing and unreadable records, and an archive suggestion above twice the
retention count. These mechanics are proposals rather than settled requirements.

## Evidence of delivery

- A new session resumes with current project context and visible unfinished work.
- Different consumers retrieve the same project decision from one shared store.
- Human developers can find readable decisions without depending on an agent.
- Source changes refresh affected knowledge or clearly mark it for review.
- Concurrent writes cannot silently overwrite one another.
- Checkpoint retries neither duplicate records nor lose saved progress.
- Rollbacks and amendments preserve an accurate account of current facts.
- Unreadable session records produce a diagnostic and usable continuation.
- Linked continuation preserves unfinished work at the eight-hour limit.
- Archival preserves decisions, evidence, and unfinished work, with verified recovery.
- Setup can proceed by accepting recommended defaults.

## Decisions still required

1. Which changes may be saved automatically, and which need publication review?
2. Which Discovery modes and source methods should be offered first?
3. What storage locations should setup recommend?
4. How should checkout and intention changes be detected without excessive prompts?
5. What evidence and source references must survive session cleanup?
6. When should archiving run, which format and storage should it use, and how
   should human-facing links to archived sessions work?

## Source and implementation planning

Extracted from [Unified Plugin Framework — draft plan](unified-plugin-framework-draft-plan.md).
This document separates the concrete product scope from the general plugin
composition architecture. It preserves the source's distinction between agreed
requirements and unresolved proposals.

The [knowledge foundation implementation plan](2026-11-14-knowledge-foundation-implementation-plan.md)
covers the initial standalone knowledge subsystem. The [follow-on scope](2026-11-14-knowledge-follow-on-scope.md)
separates knowledge incorporation/freshness, session capture, archival, and
consumer/host integration into subsequent work. The [archive reference](2026-11-14-session-archive-reference.md)
supplies proposed archival mechanics.

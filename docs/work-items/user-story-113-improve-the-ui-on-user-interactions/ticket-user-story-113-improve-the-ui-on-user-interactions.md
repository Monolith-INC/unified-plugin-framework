---
work_item_type: User Story
type: User Story
title: 'Improve the UI on user interactions'
language: en
provider: linear
provider_id: 'AGE-113'
parent_id: null
story_points: 5
---

<!-- Refinement of AGE-113, written 2026-11-19. The owner accepted every recommendation under "Decisions" on 2026-11-19. Everything above the "Conflicts found while refining" rule is the Linear description. -->

## What

* When a skill needs the user to choose, the host shows buttons, not a block of text: one button per answer for a single choice, tick boxes for several choices, and two buttons for yes or no.
* Every list of answers has an "Other" way to type your own answer.
* Every question has a short, plain explanation above the buttons.
* When the host has no such control, the same question appears as a numbered list with the same "Other" row, and the session carries on without asking the user to fix anything.

## Why

Hosts already have native question controls, but nothing in the framework asks the agent to use them. The skills say "ask", "offer" and "accept or adjust" and stop there, so the agent writes the question as chat text and has to guess what a typed reply means.

Where this happens today:

1. `plugins/unified-plugin-framework/skills/project-bootstrap/SKILL.md:12-14` and `:26`. It tells the agent to ask for the tracker, the language and the document folder, to offer a recommended default, and to collect the questions together. It never says how to show them. Accepting the setup plan is a typed reply.
2. `plugins/project-knowledge/skills/setup-project-knowledge/SKILL.md:12`, `:16` and `:22`. "Shared or separate documents", "accept or adjust" a folder, and "ask how to proceed" are all written as prose questions. `discover-project-knowledge/SKILL.md:212` and `:283` do the same for "choose a root" and "review changed units".
3. `packages/workflows/src/render.ts:75` with `packages/workflows/src/discovery.ts:58-70`. The optional-skills offer lists up to 11 Method skills as bullets and tells the agent to "offer the user these skills". That is a multiple choice shown as text.
4. `packages/workflows/src/adapter.ts:99` and `:125`, with the wording at `render.ts:113`. The `ask-user` recovery is a plain `message` string, so a question cannot carry its answers. The command line only turns it into a failure sentence (`packages/cli/src/tooling-host.ts:78`).
5. Installed dependency skills. Superpowers brainstorming, which leads all four discovery modes, ends each message with one plain sentence and "no list of example answers" (`.upf-tools/plugins/superpowers/source/skills/brainstorming/SKILL.md:43`). It offers "a short menu only when they're stuck" (`:52-53`) and says "Options steer" (`:199`). It also asks its visual-companion yes or no as chat text (`:215`). Dependency files must stay unchanged, so the framework's own wrapper skills are the only place to set the presentation rule.
6. The installer launcher asks "yes/no:" as free text (`scripts/install-release.mjs:131`). Only the exact word "yes" accepts. "y" or "yes please" declines without a word.

The installer's terminal lists are not the gap. AGE-126 and AGE-127 already ship them (see "What already exists").

## Expected Behavior

#### Question shapes

* **One choice** (tracker, document layout, language, which skill to run): one short explanation, then one button per answer. The recommended answer comes first and says it is recommended.
* **Several choices** (the optional-skills offer, workflows to enable): the same, with multi-selection.
* **Yes or no and consent** (accept the setup plan, allow an install or a download): two buttons. "Do not allow" is the safe default, as in the installer's own consent list.
* **Other:** every list has it. If the host adds one itself, the skill does not add a second. If it does not, the skill adds it.
* **Open questions** ("describe what you want") stay typed. Buttons are for questions that have a real, fixed set of answers (see Decision 4).

#### Wording

* Plain sentences, in the project's saved language, including the button labels and "Other".
* No references to other documents, tickets or earlier messages. No abbreviations or acronyms. Product names such as Linear or Codex are fine.
* One question set per interaction where the host allows, so the user is not asked one thing at a time ("collect the missing questions together", `project-bootstrap/SKILL.md:14`).

#### When the native control is missing or fails

* The same question appears as numbered text: the explanation, the answers numbered, a last numbered row "Other (type your own answer)", and one line saying how to reply (one number, or several separated by commas for multiple choice). This is the format the installer already uses (`packages/cli/scripts/installer-picker.mjs:123-135`).
* A reply that matches nothing is asked again with a valid example, without repeating the reply.
* Closing a question without choosing is never an answer and never consent.
* The session never stops, and never tells the user to fix the host.

## Acceptance Criteria

#### Scenario 1: One choice

* **Given** a skill needs one of several known answers
* **When** the host has a native question control
* **Then** the user sees a short explanation and one button per answer, the recommended one first, plus "Other", and the chosen answer comes back exactly as picked

#### Scenario 2: Several choices

* **Given** a skill needs any number of known answers
* **When** the host has a native question control
* **Then** the user can select several buttons, plus "Other", and every selection comes back

#### Scenario 3: Yes or no and consent

* **Given** a skill needs approval, such as accepting the setup plan or allowing an install
* **When** the question is shown
* **Then** it has two buttons, the safe one is the default, and closing the question counts as "no"

#### Scenario 4: Own answer

* **Given** none of the offered answers fits
* **When** the user picks "Other" and types a reply
* **Then** the typed text is the answer, word for word, in single and multiple choice alike

#### Scenario 5: Host without a native control (replaces the unfinished template scenario)

* **Given** the host has no question control in this session, or the control fails
* **When** a skill asks a question
* **Then** the question appears as numbered text with the same "Other" row, a reply that matches nothing is asked again with a valid example, and the session continues without any message about host problems

#### Scenario 6: Plain wording

* **Given** any question a shipped skill asks with fixed answers
* **When** the shipped skill text is checked
* **Then** the question has an explanation, no reference to another document or ticket, no abbreviation or acronym, and an "Other" answer

#### Scenario 7: Same rules on every host

* **Given** the Codex, Claude Code and Cursor payloads
* **When** `pnpm payloads:verify` runs
* **Then** all three carry the same question rules and pass

Checklist:

- [ ] Questions with fixed answers in the framework's own skills use the shared presentation rule (21 framework skills, the two project-knowledge skills).
- [ ] The optional-skills offer is a multi-selection, grouped to fit each host's limits, and lists every skill in the numbered fallback.
- [ ] `ask-user` recoveries can carry answers, and the skill text built from them uses the same rule.
- [ ] Button labels, explanations and "Other" use the project's saved language.
- [ ] A question closed without a choice is asked again once in the numbered form, or the step stops safely. It is never taken as yes.
- [ ] No dependency source file changes.

## What already exists

Reuse these. Do not build them again.

* **Installer lists.** `packages/cli/scripts/installer-picker.mjs` has the checklist with an "All" row (`:22`), single-choice lists, the numbered fallback (`:123-151`), and cancellation that is never read as acceptance (`:5`, `:32-43`). The wizard uses it (`packages/cli/scripts/installer-wizard.mjs:46-54`). Tests: `packages/cli/test/installer-picker.test.mjs`, `installer-wizard.test.mjs`. These draw in a terminal, so this Story reuses their rules, not their code.
* **Consent wording.** `installer-wizard.mjs:54` offers "Allow" and "Do not allow", defaulting to "no". `:38-44` re-asks with a valid example and never echoes the rejected text.
* **One place for shared skill text.** `packages/workflows/src/render.ts` fills `{{readiness}}`, `{{catalog}}` and `{{delegate}}` into 19 of the 21 framework skills, and `requiredPlaceholders` (`:142-143`) enforces them. A shared presentation section follows the same pattern. Tests: `packages/workflows/test/render.test.mjs`, `assemble.test.mjs`.
* **Language rule.** `render.ts:109` already says to use the project's saved language.
* **Recommended default and grouped questions.** Already in `project-bootstrap/SKILL.md:12-14`. Keep the intent, add the presentation.
* **Host evidence runs.** `packages/cli/src/tooling-recovery.ts:188-201` builds headless Claude Code and Codex commands. Use the same approach for the host evidence run.
* **Staging record.** The AGE-130 record (`docs/work-items/bug-114-…/user-story-116-…/review/staging-results.md`) is the format for host evidence.

## Dependencies

* **Blocked by AGE-116** (In Progress, Linear relation kept). All its tasks are done except AGE-131 (Review). It ships the installer lists this Story takes its rules from, and it edits `project-bootstrap/SKILL.md` (hand-off section, AGE-128), which this Story edits too. Planning can start now. Code starts after AGE-116 merges.
* **AGE-115** (Todo, related). Its Scenario 4 offers Method paths at the start of feature work, which is the first multiple choice that should use these controls. It also edits the discovery and bootstrap skills. See Decision 8.
* **AGE-114** (parent of AGE-115 and AGE-116). Problem 6 asks for lists in the installer; this Story covers the session side.
* **AGE-112** (Backlog, related). Same discovery experience as the discovery wrappers touched here.
* **AGE-94** (Backlog). The repair agent will ask the user during severe failures. It should reuse these rules.

## Decisions

The owner accepted each recommendation on 2026-11-19. The criteria above already assume them.

1. **Which interactions?** The ticket says "the product" without naming the installer or the session. **Recommend:** session questions only. The installer lists are done in AGE-126 and AGE-127 and are the reference for the rules.
2. **The launcher's yes or no** (`scripts/install-release.mjs:131`). It runs before the archive, and so before the picker code, exists, and extracting the archive needs Python, so a list cannot be used there. **Recommend:** fix it in AGE-116's review round: accept y, yes, n and no, and re-ask with a valid example. Done in AGE-116, so this Story leaves the launcher alone.
3. **Which hosts must have native controls?** `HOST_NAMES` lists only Codex and Claude Code (`packages/cli/src/host-names.ts:4`). Cursor has payloads (`packages/adapter-cursor/payloads/`) but is not a setup host. **Recommend:** Claude Code and Codex are the named hosts. Claude Code is tested with a recorded run. Codex uses its control when offered, otherwise the numbered fallback. Cursor gets the same text through the shared payload and is checked once by hand.
4. **Open questions versus buttons.** Superpowers brainstorming asks open questions on purpose and says options steer (see Why, item 5). **Recommend:** buttons only when the answers are a real fixed set (approvals, choosing a path, the skills offer, the visual-companion offer). Open questions stay typed.
5. **Where the rule lives for skills we do not own.** **Recommend:** a shared section in the framework's wrapper skills, written once in `render.ts`, plus direct edits to the pass-through skills that ask fixed-answer questions (`project-bootstrap` and the two project-knowledge skills). No hook for now: the session-start hook produced no output in the first-run test (AGE-114 problem 3), and AGE-115 owns that.
6. **Lists longer than a host's limit.** The offer has 11 skills; hosts cap options per question. **Recommend:** add a group label to each catalog entry and render up to four grouped multi-selection questions in one call. The numbered fallback shows all of them.
7. **Proof standard.** No CI test can see a host draw buttons. **Recommend:** deterministic gates in CI (question model output, assembled skill text for all three payloads, wording checks), plus a recorded host run in staging (Claude Code single, multiple and yes or no; Codex native or fallback), repeated three times, as in the AGE-130 record. The Definition of Done line "tests reliable and consistently ensure the visual UI" is met by those two together.
8. **Order with AGE-115.** The delivery plan lets AGE-115 run beside AGE-116. **Recommend:** write AGE-115's Method offer against this Story's rule. Whichever lands second adapts. The change is small.

## Technical Notes

* **Model.** A small pure model for fixed-answer questions: single, several, confirm. Each has an explanation, answers with an optional recommendation and group, and always "Other". Renderers turn it into host instructions and into numbered text. Wording checks return findings combined with a named `concat` and `empty`. Closed union, pure functions, results as values, per the project's functional rules.
* **Shared wording.** Skills are one `SKILL.md` for all three payloads, so the shared section names each host's control and tells the agent to use the one it has. Per-host wording would need a compiler change.
* **Where it changes.** `packages/workflows/src/render.ts` (new section beside `:130-139`, `catalogBlock` `:69-78`, `readiness` `:100-116`); `packages/workflows/src/adapter.ts:96-99` and `:125`; `packages/workflows/src/discovery.ts:58-70` (group labels); the `{{...}}` templates and pass-through skills under `plugins/`; tests next to the existing ones; docs `docs/user-journey.md`, `docs/test-matrix.md` and a README note.
* **Host facts to confirm during planning** (from community sources, not host documentation):
  * Claude Code adds "Other" itself, so the skill must not list it. A report says typed "Other" text is lost when several choices are allowed ([issue 73136](https://github.com/anthropics/claude-code/issues/73136)). Test it on the supported version. If it is lost, ask "Other" as a separate single question.
  * Codex's question tool is reported to work only in Plan mode by default ([issue 29104](https://github.com/openai/codex/issues/29104)), so the numbered fallback may be the usual path there.
  * Cursor has an ask-question tool ([protocol notes](https://cursor.com/docs/cli/acp)) that is reported to be absent in some modes and from its SDK ([forum report](https://forum.cursor.com/t/allow-askquestion-tool-calls-in-agent-mode-or-any-mode/152517)).
  * Limits on questions per call and options per question differ by host.

## Complexity

**5 points** — Highest driver: Scope=3, Uncertainty=5, Integrations=5, Data=1, QA=5, Rollout=2 → 5 points

Uncertainty and QA drive it: host controls differ and are unverified, the model's choice to use a control cannot be asserted in CI, and the lead discovery dependency pulls the other way. It rises to 8 if the owner chooses a session-start hook (Decision 5) or adds the launcher and installer changes here (Decisions 1 and 2).

## Definition of Done

- [ ] Code and documentation implemented; pull request linked to AGE-113.
- [ ] One requirements review on the pull request and one thermos pass; all findings fixed in one round.
- [ ] Unit tests: question model, both renderers, wording checks, `ask-user` with answers, grouping of long lists.
- [ ] Assembled skills for the Codex, Claude Code and Cursor payloads carry the rule; `pnpm payloads:verify` passes; every shipped skill with a fixed-answer question is covered by a test.
- [ ] Recorded host run in staging: Claude Code shows a native control for a single choice, a multiple choice and a yes or no, each with "Other", three runs each; Codex shows its control or the numbered fallback. Transcript hashes recorded.
- [ ] Full suite once before pushing (install, build, typecheck, test, `payloads:verify`, in a clean clone).
- [ ] `docs/user-journey.md`, `docs/test-matrix.md` and the README updated.
- [ ] No dependency source file changed.

## Original Description

### 1. User Story

> **As a** user
>
> **I want to** be able to interact with the product using visual UI components
>
> **So that** I can have a better experience when I need to select options from lists or answering questions with one or multiple answers

### 2. Context & Background

* The product is showing questions and options to the user via raw text on the screen, which is not the best user experience, besides promoting less accuracy when fetching answers from questions or having the user select one or more options.
* **Design & Assets:** Native host user interface components.
* **Technical Notes / Constraints:** each host must provide the closest native UI components it has to provide the desired user experience:
  1. Options, for one or multi selections, must be shown with buttons.
  2. Always display an option with "other" or equivalent to allow the user to declare his own choice if none of the offered inputs satisfies his intention.
  3. Questions also must be shown using visual UI with buttons representing the possible answers, below a short, but informative text explaining, in simple prose, with no references, abbreviations or acronyms what the system needs the user to know.

### 3. Acceptance Criteria (original)

* Scenario 1 (Happy Path) is covered by Scenarios 1 to 4 above.
* Scenario 2 was still the unfinished template. It is replaced by Scenario 5 above.

---

## Conflicts found while refining

* **Hosts.** The delivery plan and AGE-116's "Current state" paragraph say the installer sets up Codex, Claude Code or Cursor. The code sets up only Codex and Claude Code (`packages/cli/src/host-names.ts:4`), and AGE-116's own technical notes agree. Decision 3 depends on this.
* **Buttons for every question versus open questions.** The ticket asks for buttons on questions. The lead discovery dependency says options steer and forbids example lists after a question (Decision 4).
* **Dependency files unchanged versus presentation.** The ticket says "the product" should show buttons, but the questions in discovery come from dependency skills that cannot be edited (Decision 5).
* **Order.** The delivery plan lets AGE-115 run beside AGE-116, while AGE-113 waits for AGE-116. AGE-115's Method offer and this Story edit the same skills (Decision 8).
* **Unfinished ticket text.** Scenario 2 is still the template, and the Definition of Done says "verified in staging / preview environment" with no staging for a host UI. Decision 7 defines what is checked.

---
work_item_type: User Story
type: User Story
title: 'Installer: choose several hosts from lists and recover from every setup failure'
language: en
provider: linear
provider_id: 'AGE-116'
parent_id: 'AGE-114'
story_points: 8
---

## 🎯 What

- Install for several hosts (Codex and Claude Code) in one run.
- Pick hosts, workflows and choices from keyboard lists.
- Recover from every setup failure without stopping: install what is missing, set up what is needed, collect project knowledge.
- Stop only for truly unrecoverable failures, with an exact instruction, and log every failure locally.

## 💡 Why

A first install should leave the project ready without the user diagnosing setup steps.

## 📋 Expected Behavior

#### Hosts and choices

- Hosts and workflows come from a checklist with an "All" row; only hosts found on this machine start ticked.
- A rejected text answer shows a valid example, never the rejected input.
- One summary lists what will be installed, possibly backed up, or run headless, and asks once.

#### Recovery

- Each failure has one recovery: retry, install (pinned and verified, no `sudo`), back up and replace a framework-owned entry, or hand the step to the first agent session.
- Project knowledge is collected headless with consent, or handed off.
- Protections (modified files, symlinks, drift) are never overridden.
- A rerun continues where the last run stopped.

#### Result

- Exit 0 when ready, 2 when hand-offs or user actions remain, 1 when something stopped; `--strict` turns 2 into 1.

## ✅ Acceptance Criteria

- [ ] Set up and verify each picked host separately, reporting shared steps once.
- [ ] Keep setting up the other host when one fails.
- [ ] Apply the documented recovery for every failure code and log it.
- [ ] Show the cause, exact instruction and log path for every stop.
- [ ] Collect project knowledge after setup, or write a hand-off naming the exact sentence to use.
- [ ] Ask consent before any download, install or headless run.
- [ ] Leave the project unchanged when the user declines or cancels.
- [ ] Continue after a killed run without repeating finished steps or questions.
- [ ] Restore the terminal after cancelling inside a list.
- [ ] Accept `--input` with several hosts and read saved single-host plans.
- [ ] Return exit codes 0, 2 and 1 as described.

## 🔧 Technical Notes

- Only Codex and Claude Code are setup hosts today (`HOST_NAMES`); Cursor is not.
- AGE-115 makes hand-off tasks run automatically at session start; until then the `project-bootstrap` skill runs them.
- Approved approach and reviews: `docs/work-items/bug-114-…/user-story-116-…/`.

## 📊 Complexity

**8 points** — Highest driver: Scope=5, Uncertainty=3, Integrations=8, Data=2, QA=5, Rollout=3 → 8 points

## 📄 Original Description

### 1. User Story

> **As a** developer installing the framework
>
> **I want to** pick any set of hosts and workflows from lists, and get a setup report I can trust
>
> **So that** one run sets up everything I use, and a reported success means the project is ready

---

### 2. Context & Background

* **Problem:** Step 2a of the [delivery plan](<https://linear.app/agentical-monolithics/document/delivery-plan-age-110-age-114-age-113-age-94-caf977734038>). Covers <issue id="b8200597-6c22-4215-b0ed-42393d1a76b7" label="AGE-114" href="https://linear.app/agentical-monolithics/issue/AGE-114/first-run-experience-gaps-installer-host-selection-and-ui-knowledge" /> problems 5 and 6, and the installer checks from problems 2 and 4.
* **Current state:** <issue id="0e388be9-2e94-4e0a-8926-e1e084d61d52" label="AGE-110" href="https://linear.app/agentical-monolithics/issue/AGE-110/installer-only-accepts-codex-and-rejects-claude-or-multiple-hosts" /> (#25) lets the installer set up Codex, Claude Code or Cursor, but only one host per run (`packages/cli/scripts/installer-wizard.mjs`, `oneOf(HOST_NAMES)`). Prompts are free-text fields that reject input without saying what is valid. Setup can report success while the knowledge store is empty.
* **Order:** <issue id="f006c98c-e4bb-400d-9427-0b4b589348c6" label="AGE-113" href="https://linear.app/agentical-monolithics/issue/AGE-113/improve-the-ui-on-user-interactions" /> starts after this Story, so the session's choice controls follow the same rules as the installer's lists.

---

### 3. Acceptance Criteria

#### Scenario 1: Several hosts in one run

* **Given** the interactive installer
* **When** the user picks two or more hosts, or "all"
* **Then** setup, registration and verification run for each picked host, and the report shows the result for each one

#### Scenario 2: Selection lists

* **Given** a prompt for hosts or workflows
* **When** the installer asks for them
* **Then** the user picks from a checklist (arrow keys and space), single choices are picked from a list, and a summary screen comes before anything is applied

#### Scenario 3: Rejected input

* **Given** a value the installer cannot accept
* **When** the user enters it
* **Then** the installer shows a valid example, and the help text and the parser accept the same forms

#### Scenario 4: Non-interactive install

* **Given** a CI run with no terminal
* **When** the installer runs with flags or environment variables
* **Then** it applies the same choices as the interactive lists, including several hosts

#### Scenario 5: Setup proves it worked

* **Given** an install that finished its steps
* **When** the knowledge server does not answer, or the knowledge store is empty
* **Then** the installer does not report success; it fills the store or names the exact next action

---

### 4. Definition of Done

- [ ] Code implemented and PR linked to this Linear issue
- [ ] Peer review approved and CI checks passing
- [ ] Unit and integration tests written and passing, including a several-host install and a non-interactive install
- [ ] Acceptance criteria verified in a fresh test project
- [ ] README installer section updated

# Patterns to borrow from monolithic-dev-harness

Research note, 2026-11-21. Read-only inspection of the local checkout `/home/monolith/projects/monolithic-dev-harness` (branch `codex/finish-rc15-integration`, equal to `origin/codex/finish-rc15-integration`, head `465e639`; remote `Monolith-INC/monolithic-dev-harness`). No remote fetch was needed; the checkout matches its remote branch. Paths below are relative to `plugins/monolithic-dev-harness/` unless they start with `.superpowers/`.

Short answer to the three questions:

| Idea | What the harness really does | Borrow? |
|---|---|---|
| Ask-the-user question | No new tool. Hooks wrap the host's own question tool (`AskUserQuestion`, `request_user_input`). A CLI call (`harness decision present`) returns the exact payload the agent must pass to the native tool. A second hook records the answer | The **shape** (one question channel, ids, typed-reply fallback). Not the machinery |
| Storyboard | A static reference file plus a machine-readable **route** (25 steps) plus a per-prompt "Current step" line from the mode's `orient` hook | **Yes**, as data: a state table the agent is re-oriented from at every prompt |
| `next` tool | It is a **CLI command** (`harness next`), not a tool. A `Stop` hook sends the agent back once, telling it to run it | **Yes**, with a hard loop guard. Best done as a hook that injects the answer instead of asking the agent to call a command |

## 1. Asking the user a question

### How it works

The harness never replaces the host's question control. It makes the agent use it, and makes the answer count.

1. **Staging.** The agent runs `harness decision present --gate <id> ...` (`references/human-decisions.md`). Standard questions live in `config/gates.toml`, already worded (and translated) so the agent cannot reword them. The command returns `already_answered`, or `waiting_for_human` with a `transport`: `blocking`, `async` or `chat`, plus a `questions` payload to pass **verbatim** to the native tool.
2. **Before the tool shows.** `PreToolUse` on `AskUserQuestion` (Claude) and on `.*` (Codex; `handle_pre_tool` special-cases `request_user_input` and `request_user_input_async`) runs `handle_ask` in `scripts/harness/hook.py`. It denies a question that is not plain, does not match the staged record, offers an unnamed tracker, or asks before the reviewed files were shown (`plain-questions`, `decision-pending`, `artifacts-not-shown`).
3. **After the click.** `PostToolUse` on the same tool runs `handle_answer`, which writes the answer into the decision record. A tool acknowledgement is never an answer. Only the real reply counts.
4. **Typed replies.** `UserPromptSubmit` (`handle_prompt`) matches a typed reply loosely to the pending menu (`2`, `option 2`, the label in any case, a unique prefix). Ambiguous replies leave the menu pending.
5. **Fallback chain.** If the native control fails: `harness decision fallback` moves the same question blocking → async → chat. Chat always works, because the typed reply always counts.
6. **Codex.** `scripts/host_adapters/codex_relay.py` and `harness decision recover` read the real Codex session transcript under `~/.codex/sessions` to recover an answer the hooks missed. It verifies the pending record, exact question, delivery and the following user message. The harness also keeps a Codex runtime profile: Default-mode `request_user_input` is an **optional** control only. It cannot host a required approval (needs Plan mode or a real mode switch). This matches what we measured with `default_mode_request_user_input = true`: the tool exists but a skill alone does not force its use.
7. **Stop guard.** `handle_stop` never ends a turn while a staged native decision is pending without presenting it.

State: `.harness/state/` (`decision.json` per scope, `control-questions`, `asked`, `question-observations`, `host_sessions/codex/`).

Tests worth reading: `tests/harness/test_codex_relay.py`, `test_native_delivery_routing.py`, `test_present_again.py`, `test_bootstrap_confirmation.py`.

### What it cost

The ADR `.superpowers/specs/2026-11-12-harness-assurance-architecture-design.md` records the outcome. In the rc.13 trial the answer hooks hit their 10 s limit four times (two tracker reads inside the hook), the user's approval was never recorded, and the open question then refused every tool, including re-asking it. A full lockup. Follow-up plans (`.superpowers/plans/2026-11-14-lockup-fixes.md`, `2026-11-14-root-cause-failure-modes.md`) list seven failure modes. Fallback/recover/repair/reuse commands exist mainly to patch drift between several copies of one fact.

### Recommendation for UPF

- Keep our current approach (name the host tool in the skill, numbered fallback). It already covers the harness's final fallback.
- Borrow only: **one question id per question**, a typed reply always counts, and "tool acceptance is not an answer".
- If we add enforcement, make it a single local `PreToolUse`/`Stop` check: *"a turn ended with an option list in prose while a native question tool exists"* → one nudge naming the tool. No decision store, no relay, no transcript recovery.
- Observation worth testing next: the Codex session must start with the feature enabled. Resumed threads can keep their old tool set.

## 2. Storyboard: orienting the agent at any state

### How it works

Three layers, all data except the last line:

1. **Narrative reference.** `references/workflow-storyboard.md` is the plain-language rules (menu vs batch, back/pause/resume/cancel, approvals, "ready reference" table of tools per need).
2. **The route as data.** `config/prepared-workflows.json` holds `facts` and `route`. Each of the 25 steps has `id`, `stage`, `scope` (`work`/`story`/`delivery`), `when`/`unless` conditions, `skill`, `gate`, `command`, `say` and `done` facts. Stages (`ideate`, `discovery`, `planning`, `hardening`, `refinement`, `preparation`, `execution`, `verify`, ...) also list `knowledge`, `operations` and `skills` with a `when` for each. Facts are `check` (computed), `answer` (user's last answer to a gate), or `any`/`all`/`not`. `scripts/harness/route.py` is a pure evaluator: `next_step` returns the first step that applies and is not done.
3. **Per-prompt injection.** The mode hook `orient` (`scripts/harness/mode_hooks.py`) runs on `UserPromptSubmit` and adds `[harness] mode: <name>`, `Current step: <label>` and the mode's `rules.md` (short imperatives) to the agent's context. `SessionStart` (`session_entry.on_start`) adds "Saved work ... Checkpoint ... Waiting question ... Run harness begin to continue." The step is read on a daemon thread with a 4 s cap and degrades to one line saying it could not be read.

Modes (`modes/<name>/mode.toml`, `workflow.md`, `rules.md`) replace the older global route. Only `discovery` exists. Its routing table is derived from documents on the Epic, so state is **derived, not stored**.

### Gap relative to what you described

The storyboard is injected at **prompt time and session start**, not "after presenting the elicitation options and running them". There is no hook keyed on an arbitrary workflow event (for example a `PostToolUse` after an elicitation menu) that injects the list of possible directions. The route's `say`/`gate`/`skill` fields are close to a per-state direction list, but nothing renders a branch list from them at that moment.

### Recommendation for UPF

- Make our storyboard a **typed state table** in `packages/workflows` (state id → purpose, allowed directions with the next state, skill/tool to use, ask-the-user shape), validated at build time like the harness's `route.py` `_check`/`_acyclic`.
- Track the current state in one small local record keyed by work item (the harness's later ADR says: hooks read only local records).
- Inject the current state's directions at the moments you named: after a menu is answered (`PostToolUse` of the question tool where available) and on `UserPromptSubmit`. Keep the text short; the harness uses short imperatives, not prose.
- Keep step reads local and bounded (the lockups came from tracker reads on the hook path).

## 3. The `next` mechanism

### How it works

- **It is a command, not a tool.** `harness next --repo <project> [--session-id]` (`scripts/harness/cli_workflow.py` → `route_facts.next_for`) prints JSON. It is not an MCP or native tool.
- **Input:** no position argument. The current position is computed from the work session, pending decisions and facts. If setup is not ready it returns the `setup` step. With no session: `state: no_session`. A blocking question: `state: waiting_for_human` with the question and options. Otherwise `route.next_step` over `ProjectFacts` returns the step (skill, gate, command, `say`, missing facts) or `complete`.
- **Enforcement:** the `Stop` hook (`handle_stop`, `hooks/hooks.json` and `hooks/codex.hooks.json`). It lets the turn end when the user is being asked something (pending menu, a final line ending in `?`), when the harness is suspended, in free mode, paused, or when no workflow is active. Otherwise it prints `{"decision":"block","reason":"... Run \`harness next\` and do the step it gives now ..."}`, which makes Claude Code and Codex continue the turn.
- **Loop guard:** `hook_bridge` checks `stop_hook_active` / `loop_count`, so the agent is sent back **once** per stop. (This was added after lockups; ADR rule 5: escalate, never repeat the same push.)
- **Rule in the text:** `references/human-decisions.md`, "Never stall": every turn ends with a menu, a question batch, or a `Next:` line.

### Lessons

- The nudge works on Claude and Codex because both treat `decision: block` on `Stop` as "continue".
- It depends on the agent obeying a second instruction (run a command). Injecting the answer from the hook removes that step.
- Hooks must be local, bounded and have a way out. The ADR's five rules: local (no network or tracker), bounded time, name an allowed way out, never block the exit, no repeating loops.

### Recommendation for UPF

- Add a `next` capability as **pure function** (state table + facts → next action) exposed by one thin CLI command and reused by the hook.
- `Stop` hook: if the active workflow state is not terminal and the turn did not end in a question or native question call, block **once** with the `next` result inline in `reason` (so the agent needs no extra call). Respect `stop_hook_active`.
- Exempt: pending question, user-requested pause or stop, no active workflow.
- Codex: we already install a `Stop` hook in `.codex/hooks.json`; Claude: `.claude/settings.local.json`. Cursor and Antigravity need their own check of the equivalent event before promising it.

## Suggested adoption order

1. State table + pure `next` evaluator + tests (no hooks yet).
2. `UserPromptSubmit` / `SessionStart` injection of the current state's directions.
3. `Stop` hook with one-shot nudge, using the `next` result.
4. Optional: prose-option-list detector that nudges toward the host question tool.

Each step is independent and can ship alone. See also [host-interaction-tools.md](host-interaction-tools.md).

## More ideas from a wider read of the source

A second pass over `scripts/harness/`, `scripts/host_adapters/`, `config/`, `scripts/check_repo.py` and `tools/`. These are ranked by value to UPF and how cheaply they fit what we already have.

### High value, low cost

| # | Idea | Where in the harness | Why it fits UPF |
|---|---|---|---|
| A | **Plain-question linter.** Before a native question is shown, the hook checks: one question at a time, ≤ 50 words, ≤ 25 words per option description, at most one `?`, no jargon (file names, code, tool or rule names), and no pre-filled `answers`. A failing question is sent back with the exact reasons | `scripts/harness/questions.py` (`problems`, `rewrite_reason`) | A pure function over the tool input. We can ship it as a `PreToolUse` check on `AskUserQuestion` / `request_user_input` and also as a unit test helper for skill prompts. This is concrete AGE-113 work |
| B | **Question catalog.** Standard questions live in `config/gates.toml`, already worded in every supported language (`en`, `pt-br`), with ≤ 3 options, a `recommended` option, slot values (`{story}`) and flags (`approval`, `artifact`, `free_text`). The agent asks by id and never rewords | `config/gates.toml`, `scripts/harness/gates.py` | Our recurring questions (installer choices, workflow transitions, discovery directions) become data. They are consistent, translatable and testable. Pairs with the storyboard: each state lists the gate ids it may ask |
| C | **Diagram generated from the route, checked in CI.** `route_diagram.py --write` draws a Mermaid flowchart from the route. `--check` fails when the committed diagram drifts | `scripts/harness/route_diagram.py`, `check_repo.py` (`check_route_diagram`) | Once we have a state table, `docs/workflows/*.md` diagrams can't go stale. Same pattern as our `specs:verify` |
| D | **Repository consistency check.** One offline script checks: shipped files are tracked, JSON parses, schemas validate, every mode loads, every skill's frontmatter `name` matches its folder, docs have frontmatter, the diagram matches the route, and relative Markdown links resolve | `scripts/check_repo.py` | We have pieces (`payloads:verify`, `specs:verify`). Skill-name/folder match and broken-link checks are cheap additions |
| E | **Fresh test copies, never reused.** `project_fixture.py` copies the template project to the **next unused** `temp/test-NNN/`, installs a published release there the way a user would, and never deletes old copies ("cleared from `temp/` by hand") | `tools/project_fixture.py` | Directly prevents the mistake I made today (wiping a live test project to reinstall). A `pnpm fixture` script that always makes a new sibling folder would make this structural, not a rule to remember |

### Medium value

| # | Idea | Where | Notes |
|---|---|---|---|
| F | **Hook time budget.** Each event stops itself ~3 s before the host's limit (12 s before tool calls, 7 s otherwise) and says so instead of being silently cancelled. `OutOfTime` subclasses `BaseException` so no `except Exception` swallows it. Once an answer starts being written (`commit`), it is never cut off. Repeated timeouts per decision escalate the way out | `hook_budget.py`, `hook_timing.py` (one timing line per event in `.harness/state/hook-timing.log`) | Our MAKS hooks are small today. Adopt the **timing log** now (cheap diagnosis). Adopt the budget when hooks start reading state |
| G | **Suspend / resume / free mode via prompt.** The prompt hook recognizes `suspend harness`, `resume harness`, `free mode` (and pt-BR) **before anything else runs**. Suspension turns off every veto but keeps evidence. Free mode keeps safety checks but drops guided workflow | `harness_controls.py`, `skills/suspend-harness/SKILL.md`, gate `harness-controls` | Essential once UPF hooks can block or nudge (the `Stop` nudge). The user must always have a way out that no hook can refuse |
| H | **Show before asking.** `harness workflow show --artifact` prints the files and records their digests. A gate marked `shown` can only be asked about files shown as they read now. A changed file invalidates the earlier approval. On Claude (where tool output is hidden) the agent's own reply must carry the file's headings | `artifact_review.py` | Good for document approvals in discovery (brief, PRD). Digest-bound approval is simple and strong |
| I | **Pure reducers for interactive flows.** The elicitation chooser is a pure `reduce_selection(state, event) -> Result[state]` with phases `choose → apply → hardening`, paging, reshuffle and reopen. Invalid transitions are an error value, not an exception | `elicitation.py` (pure), `elicitation_store.py` (effects) | Exactly the shape our FP rules ask for. Use it for the elicitation step of the storyboard: the direction list after "elicitation options ran" is this reducer's state |
| J | **Knowledge-first reminder.** In a mode that opts in, the first non-knowledge read gets one reminder to search the project knowledge store first. One search satisfies it per prompt. An empty store never blocks. Pure policy over `State(searched, reminded, empty_noticed)` | `knowledge_first.py`, `knowledge_first_live.py` | UPF already ships `Project_Knowledge` units. A one-time, non-blocking nudge is low-risk |

### Worth knowing, not adopting now

| Idea | Where | Why not now |
|---|---|---|
| Host capability declarations checked against the adapter. `hosts/<host>.json` (schema-checked) declares which subagent operations a host supports. The adapter returns a record of functions. An undeclared operation returns `unsupported_capability`, and a bad result becomes `invalid_host_result` | `host_adapters/subagents.py`, `config/host.schema.json` | Same spirit as our `host-specs.json`. Borrow the "declared vs. implemented, checked at load" rule if we add host operations beyond install |
| Installation receipts and fingerprint-bound repair. Every install writes a journal. `doctor` lists findings with repairs identified by a hash of the repair, and the user applies a repair by id | `installation_receipts.py`, `installation_doctor.py` | A good model for a future `upf doctor`, but our zero-CLI installer is already deterministic |
| Shell write scanner (what a shell command could write; inline-Python read-only detection) | `shellscan.py` (1.1k lines), `inline_python.py` | Large and only needed for write-scope enforcement |
| Process bus (JSON-RPC between root and subagents), decision relay, transcript recovery | `process_*.py`, `codex_relay.py` | The harness itself is unsure they are in live use (ADR §6) |
| Constitution file | `CONSTITUTION.md` | Settled owner decisions, each recorded once with a date, read before designing. Our `AGENTS.md` + ADRs cover this; a short "settled decisions" list could still help |

## Key files inspected

- `references/workflow-storyboard.md`, `references/human-decisions.md`
- `config/prepared-workflows.json`, `config/gates.toml`
- `scripts/harness/route.py`, `route_facts.py` (`next_for`), `mode_hooks.py`, `modes.py`, `hook.py` (`handle_stop`, `handle_ask`, `handle_answer`, `handle_prompt`), `session_entry.py`
- `scripts/host_adapters/hook_bridge.py`, `interactions.py`, `codex_relay.py`
- `hooks/hooks.json`, `hooks/codex.hooks.json`
- `modes/discovery/{mode.toml,workflow.md,rules.md}`
- `.superpowers/specs/2026-11-11-modes-discovery-design.md`, `2026-11-12-harness-assurance-architecture-design.md`
- `.superpowers/plans/2026-11-14-lockup-fixes.md`, `2026-11-14-root-cause-failure-modes.md`
- Second pass: `scripts/harness/{questions,gates,route_diagram,hook_budget,hook_timing,harness_controls,artifact_review,elicitation,knowledge_first,installation_doctor,installation_receipts}.py`, `scripts/host_adapters/subagents.py`, `config/gates.toml`, `scripts/check_repo.py`, `tools/project_fixture.py`, `skills/suspend-harness/SKILL.md`, `CONSTITUTION.md`

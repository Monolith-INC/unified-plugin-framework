# UPF meta-planning journal

Working record for ideas developed during delivery. AGE-196 is the first case. Promote the model into the product after evaluating how it works in practice.

## 2026-11-26 — Trace documentation into delivery

- **Problem observed:** General document links leave the implementer to infer which clauses govern a task. A reviewer cannot easily see whether the delivered changes cover the source intent.
- **Proposed discipline:** Start from the highest applicable work item and its source artifact. Refine requirements through each applicable level, then write the implementation plan's requirement set, acceptance mapping, and ordered tasks. Each task repeats the small relevant slice and links to the exact source sections. Evidence returns through the same map at review and shipping.
- **Task template candidate:** Source sections and IDs, requirements, acceptance conditions, verification, and completion evidence. Distinguish a task that proves a criterion from one that establishes a prerequisite. Label staging, review, and breakdown as delivery or planning checks.
- **Trial:** Apply the model to the real [AGE-196 map](bug-196-connect-codex-native-question-responses-to-workflow-decision/traceability-map.md) before coding. Add Linear keys alongside the stable task references after publication. Add observations at task intake, task closeout, PR review, and shipping.
- **Evidence to collect:** Record where the map catches a missing check, changes an implementation decision, saves a source lookup, or helps a reviewer resolve an acceptance question. Also record duplicated work, added effort, and any case where the mapping was unclear. Capture work-item and evidence links when available.
- **Open design questions:** Where the map should live in the product, how links survive revisions, what to automate, and how to keep the process lightweight for a small bug.
- **Trial status:** The first map is prepared. Delivery observations and product adoption decisions are pending.

## 2026-11-26 — Plan review with the map

- **User feedback:** The AGE-196 map is ready to use in the implementation plan review.
- **What the map clarified:** Host research can satisfy AC05 and establish a prerequisite for AC01. Only live evidence of the automatic handoff can close AC01. The plan now spells out how T01's findings determine which native paths T03 can wire and how work continues where a host has a verified limitation.
- **What to observe next:** Check whether T01 can be taken straight from its Linear task and whether its evidence is enough for the next implementer to choose a supported path without repeating the investigation.

## 2026-11-26 — Drafting the tasks from the approved plan

- **Observation:** The map let us carry source sections, requirement IDs, criteria, and focused checks directly into each draft. The three delivery and planning tasks needed their own observable completion checks rather than claims about product behavior.
- **What to observe next:** Once Linear assigns keys, check the published descriptions and whether the evidence can be recorded on the same issue without a second document lookup.
- **Publication observation:** The Linear preflight checks the full team label set even for a Task-only batch. It reported the Epic label missing while the Task label was present. Make publication prerequisites visible before requesting approval so the reviewer can approve a batch that is ready to publish.

## 2026-11-26 — AGE-196 incident: routine tracker faults became user work

**Source transcript.** [Codex session transcript — Fold AGE-113 into AGE-155](</home/bhave/Documents/10_Projects/Unified Plugin Framework/agent_session_transcripts/2026-11-26-codex-fold-age-113-into-age-155-session-transcript.md>). The selected excerpts below focus on the AGE-196 publication incident.

**Impact.** The nine drafts were ready, but implementation was delayed first by a missing label unrelated to the batch and then by competing gateway owners. The user had to add the label, come back to confirm it, approve publication, and was then asked to reload the workspace. Stop reminders led to more menus about the infrastructure instead of advancing the work. The last read confirmed zero child tasks. The drafts and approval were retained. Gateway recovery and publication were still pending when this incident was recorded.

**Selected transcript excerpts.** These are chronological excerpts from this chat, with intervening messages and payload fields omitted. The window starts at the missing-label report and ends when the user identified the recurring interruption as a product design failure.

1. **Assistant, label check:** “The harness still reports the Epic label missing from the AGE team. I’ve left the confirmation prompt open. The nine drafts are ready for publication review once preflight passes.”
2. **User, after making the change:** “I added the Epic label in Linear. Run preflight again and show me the nine AGE-196 task drafts for approval.” The next gateway preflight returned `ready: true` and `missing_labels: []`.
3. **User, publication decision:** “Aprovar (Recomendado).” The harness recorded approval `HB-Q67A2AC4F` for the nine reviewed drafts.
4. **Tool guard, first write attempt:** “Multiple live workflow-integrations instances own this project; select MDH_GATEWAY_HOST and MDH_GATEWAY_INSTANCE. No provider was started.” The follow-up child-list read returned `[]`. A passing label preflight had established label readiness, while the host write guard still could not select a gateway owner.
5. **Assistant, recovery handoff:** “Please reload the Codex workspace to reconnect workflow-integrations. The nine drafts and your approval are saved.”
6. **Stop hook, after the handoff:** “The workflow is still active, and this turn ends without a question for the user or a pending menu, so the user would have to ask what's next.” The next check still reported competing owners, and the assistant opened a menu asking whether the workspace had been reloaded. The menu performed no recovery.
7. **User, meta-planning direction:** “Anyway, something that me, the user, the developer, should not be bothered with. This is a problem with people who design this product.”

**Product requirements to refine.** Apply the [continuous-work article](upf-continuous-workflow-constitutional-article.md#problem-handling) to the publication path itself.

- **Scope readiness to the operation.** A batch of Tasks checks what it needs to create Tasks. An unrelated Epic label cannot block it. Detect the conditions that would actually prevent a write, including whether the guard can resolve the same gateway the write will use. Where provisioning is required and already authorized, recover in the workflow.
- **Own gateway recovery.** Bind the operation to an unambiguous gateway owner. Map a bounded timeout, retry, and safe recovery or escape route for an ambiguous or lost owner. Preserve the drafts and approval across recovery. If a write's outcome is uncertain, reconcile by reading the tracker before retrying to avoid double publication.
- **Separate user decisions from recovery state.** An approved batch waiting for infrastructure is a recovery state. A stop hook should recognize that state and its route to resume, without requiring a filler question. Keep independent authorized work moving. If product recovery is exhausted, preserve the incident and progress and route the fault to product maintainers. Ask the user only for a decision or action that genuinely requires their authority, with a concrete option ready.
- **Make the scenario ready at runtime.** Index these as discrete recovery cases for tracker prerequisites, competing gateway owners, and uncertain publication. Include timeouts, authorized actions, verification, fallback, and when to escalate, so the runtime can retrieve the right route immediately.

**Regression evidence for product adoption.** Replay three cases: a Tasks-only batch with no Epic label; competing gateway owners after approval; and an uncertain result after a publication attempt. Verify that the first proceeds, the second recovers on the approved batch or records a product incident, and the third reconciles before retry. In each case check for duplicate writes, repeated approvals, unnecessary menus or reload requests, and whether independent work continued. Measure elapsed delay and user interventions alongside correctness.

## 2026-11-26 — Publication resumed on the existing approval

The resumed harness could route to the tracker. We confirmed zero children before retrying, then published AGE-197 through AGE-205 in plan order using the earlier approval. Readback verified all nine parents, Task labels, and reviewed descriptions after Linear's formatting normalization. Breakdown was marked Done. The traceability map now connects the stable plan references to the actual Linear keys. The evidence establishes successful recovery on this resume. It does not identify what cleared the original gateway conflict.

## 2026-11-26 — The first task separated protocol evidence from live acceptance

AGE-197 recorded three evidence levels: an actual Codex app-server round trip with a fixture answer, a Claude Code capability observed during connection, and a Cursor IDE capability documented by the vendor. Each supports a different claim. The task remains open because the Claude response and Cursor IDE paths have not been observed. The delivery map preserves the distinction between qualifying a host interface and proving the final user-to-workflow handoff.

## 2026-11-26 — Closeout and a compatibility check

AGE-197 closed on the selected Codex scope with evidence in Linear. The Claude Code and Cursor validations remain distinct follow-up entries in the host evidence, with their existing fallbacks retained. AGE-198's focused tests exposed a difference between UPF's display order and the order supplied by an existing CLI caller. The fix shares rendering order where UPF renders the decision and preserves the order where the caller owns it. This was an example where the task's documented verification caught a compatibility issue within the same task.

## 2026-11-26 — Distinguishing a recovery message from recovered work

AGE-200's task check exposed that the adapter could report a failure while leaving the pending decision on the failed channel. Verification now checks the returned state: the same question and workflow step remain pending, the replacement channel can receive input, and the old answer cannot advance it. A different decision completed while the first form waited. The test uses those observable outcomes to distinguish recovery from an error message.

## 2026-11-26 — Recovery guidance at the point of need

AGE-201 turned four interruption reasons into exact lookup IDs in the existing knowledge store. The Codex cancellation probe verified that the tool result could contain both the usable replacement decision and the one relevant source-backed unit. The useful acceptance distinction is between indexing a document and proving that the affected runtime retrieves it when needed.

## 2026-11-26 — Live human answer through the production continuation

AGE-202 observed a real native form in the Codex terminal and a matching response at the production UPF handler. The terminal first refused the tool call under a policy that could not show its notice. Running the test with normal tool permissions allowed the native form to open without changing workspace settings. The passive recorder retained only the form action, selected stable ID, and resulting workflow state. The observed selection advanced the inert workflow from context at occurrence 0 to execute at occurrence 1.

## 2026-11-26 — Staging verified, tracker closeout interrupted

The delivery candidate passed staging after the CLI suite and payload verification were rerun with host access. The approved staging evidence reached Linear. The following status change failed before execution because automatic approval review had no workspace credits. Readback confirmed AGE-203 was still In Progress. Keep the verified candidate and tracker evidence intact, and perform independent work locally rather than repeating the staging checks or asking for the same evidence approval.

## 2026-11-26 — Review found a gap between the live tool and the normal entry point

The live AGE-202 evidence proved that Codex could deliver an answer to UPF when the tool was called directly. The final review traced the installed discovery instructions and found that they still led through a manual answer path. The review also identified a lost-result retry, an older review form completing after a newer revision, and missing locale data. The delivery branch now routes eligible discovery directions through the registered tool. Focused checks cover the generated instructions, retry after a successful answer, a superseded form, and localized MCP forms. Preserve the distinction in the traceability map between a direct live tool call and a live run from the normal discovery entry point.

For future native integrations, include the normal entry point in the verification check from the start. A useful test follows the same entry point, capability selection, prompt identity, and continuation that production uses. When a final review changes behavior, renew the staging evidence against the resulting revision before moving the staging task to Done.

The follow-up live run started from the assembled discovery skill in the Codex terminal. The first request used a language name where the tool expected a language tag. The runtime left the step pending and retried with the same state before the form appeared. The human's native selection then reached the workflow and advanced it to `conversation` at occurrence `1`. Both the generated instructions and the tool schema now specify the tag format. This caught a contract ambiguity the direct live probe had skipped.

## 2026-11-26 — Staging and acceptance closed after suspension

Two live gateway processes from the same Codex host still claimed the original project. Selecting an instance worked for the harness CLI, while the tracker-write hook required a unique owner. The delivery clone had no harness binding, and the installed version keeps work-session state local to its original clone. After the user selected Suspend harness, the existing tracker connection accepted the AGE-203 completion and the AGE-204 review. The six criteria and their evidence are recorded in the [acceptance review](bug-196-connect-codex-native-question-responses-to-workflow-decision/age-204-acceptance-review.md). Keep the suspended session and branch available for the remaining pull request closeout.

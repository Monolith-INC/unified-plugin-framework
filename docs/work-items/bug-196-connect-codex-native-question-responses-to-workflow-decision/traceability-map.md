# AGE-196 delivery traceability

This map starts at [AGE-196](https://linear.app/agentical-monolithics/issue/AGE-196/connect-host-adapter-question-responses-to-workflow-decisions), which is the delivery item. AGE-154 and AGE-156 are prior delivery context. T01–T09 are stable plan references linked below to their published Linear tasks. Product verification is planned. The Breakdown task is Done after publication and readback.

| Plan reference | Linear task |
| --- | --- |
| T01 | [AGE-197 — Verify host boundaries](https://linear.app/agentical-monolithics/issue/AGE-197/verify-host-boundaries) |
| T02 | [AGE-198 — Define and implement the neutral response seam](https://linear.app/agentical-monolithics/issue/AGE-198/define-and-implement-the-neutral-response-seam) |
| T03 | [AGE-199 — Connect supported host adapters and continuation](https://linear.app/agentical-monolithics/issue/AGE-199/connect-supported-host-adapters-and-continuation) |
| T04 | [AGE-200 — Add continuous recovery](https://linear.app/agentical-monolithics/issue/AGE-200/add-continuous-recovery) |
| T05 | [AGE-201 — Index recovery guidance](https://linear.app/agentical-monolithics/issue/AGE-201/index-recovery-guidance) |
| T06 | [AGE-202 — Prove the end-to-end path](https://linear.app/agentical-monolithics/issue/AGE-202/prove-the-end-to-end-path) |
| T07 | [AGE-203 — Staging](https://linear.app/agentical-monolithics/issue/AGE-203/staging) |
| T08 | [AGE-204 — Review](https://linear.app/agentical-monolithics/issue/AGE-204/review) |
| T09 | [AGE-205 — Breakdown](https://linear.app/agentical-monolithics/issue/AGE-205/breakdown) |

## Source requirements

| ID | Requirement carried into the plan | Authoritative source section |
| --- | --- | --- |
| R01 | Use a host-neutral question boundary. Keep vendor behavior in concrete adapters. A fixed answer carries its stable ID; a custom answer preserves the typed value. | [Approved approach, Boundaries & Constraints](approach-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#boundaries--constraints); [ticket, Answer delivery](ticket-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#answer-delivery) |
| R02 | Route an eligible native answer automatically to its matching decision, at most once. Invalid or unproven input cannot authorize a protected action. | [Ticket, Answer delivery](ticket-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#answer-delivery); [approved approach, I/O & Edge-Case Matrix](approach-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#io--edge-case-matrix) |
| R03 | Keep unresolved decisions resumable, continue independent authorized work, preserve fallbacks, and handle problematic effects using the applicable recovery or incident route. | [Ticket, Continuity and recovery](ticket-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#continuity-and-recovery); [continuous-work article, Problem handling](../upf-continuous-workflow-constitutional-article.md#problem-handling) and [Decisions and waiting](../upf-continuous-workflow-constitutional-article.md#decisions-and-waiting) |
| R04 | Retrieve discrete timeout, escape, and recovery guidance at the point of need from the existing knowledge mechanism. | [Continuous-work article, Mapped scenarios](../upf-continuous-workflow-constitutional-article.md#mapped-scenarios) |
| R05 | Confirm vendor-specific behavior against official documentation and the installed version. Record unsupported behavior and evidence limits. | [Approved approach, Boundaries & Constraints](approach-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#boundaries--constraints) |
| R06 | Verify the actual handoff with host-shaped test coverage and live evidence, or document a verified host limitation. | [Ticket, acceptance criteria](ticket-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#-critérios-de-aceite); [approved approach, Provisional tasks and acceptance](approach-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#provisional-tasks-and-acceptance) |

## Acceptance criteria and coverage

The criterion text is taken from the [AGE-196 ticket](ticket-bug-196-connect-codex-native-question-responses-to-workflow-decision.md#-critérios-de-aceite), in order. Supporting tasks establish prerequisites or partial coverage. The evidence column identifies what closes the criterion at parent review.

| ID | Acceptance criterion | Planned coverage and closing evidence |
| --- | --- | --- |
| AC01 | A supported native response reaches the matching continuation automatically with its stable answer ID. | T01 and T02 establish the boundary and contract. T03 wires the path. T06 demonstrates it live. |
| AC02 | Custom answers retain their typed value, and unsafe or invalid responses cannot authorize an action. | T02 proves answer semantics. T03 proves continuation and consent handling. T04 covers timing and recovery cases. |
| AC03 | Decisions remain resumable and independent work continues across the recovery cases above. | T04 exercises the recovery paths and verifies continued independent work. |
| AC04 | Relevant recovery guidance is retrievable at the point of need from the existing knowledge mechanism. | T05 demonstrates scenario-specific retrieval in the applicable runtime context. |
| AC05 | Host-specific behavior is confirmed against the vendor's official documentation and installed version; unsupported behavior is identified. | T01 records the source, version, surface, and evidence per host. T06 confirms the limits of the shipping claim. |
| AC06 | Focused host-shaped automated coverage and a live native check establish the actual handoff, or document a verified host limitation. | T03 provides focused automated coverage. T06 records live evidence or a verified limitation. A limitation cannot be counted as a passing AC01 demonstration. |

## Task acceptance and verification

| Task | Trace | Acceptance condition and focused verification |
| --- | --- | --- |
| **T01 Verify host boundaries** | R05, R06; AC05, supports AC01 and AC06 | Record a verified path or evidenced limitation for each in-scope host and surface. For each entry, check the installed version, cite the exact official documentation section, and save the result of a focused probe where the interface is accessible. A reported limitation names the missing boundary and fallback. |
| **T02 Define and implement the neutral response seam** | R01, R02; AC02, supports AC01 | A fixed choice yields its stable ID, custom input retains its value, and display and decoding share one ordering. Focused contract checks exercise reordered choices, custom text, and ambiguous consent. |
| **T03 Connect supported host adapters and continuation** | R01, R02, R05, R06; AC01, AC02, supports AC06 | A verified concrete adapter routes a matching decision response through the production continuation once. Test the documented host-shaped event and duplicate, stale, unknown, ambiguous, and dismissed inputs. Verify invalid inputs cannot authorize a protected effect. |
| **T04 Add continuous recovery** | R02, R03; AC02, AC03 | Dismissal, timeout, disconnection, unavailable controls, and tool failure preserve resumability and allow independent work. Check fallback, late response after replacement, and relevant incident and safe recovery behavior. |
| **T05 Index recovery guidance** | R03, R04; AC04 | Applicable guidance is retrievable from the existing mechanism. Exercise the runtime lookup for representative timeout and escape or recovery cases, and confirm the result identifies the appropriate action. |
| **T06 Prove the end-to-end path** | R02, R05, R06; AC01, AC05, AC06 | Record a real native response arriving at the production continuation without manual translation. Record the host, version, surface, and redacted trace. Where a live path is unavailable, record the verified limitation, fallback, and any remaining unmet criterion. |
| **T07 Staging** | Delivery verification for R01–R06 and AC01–AC06 | Record the revision, required project checks, and staging or live verification environment. Link results so Review can identify the build and host to which the evidence applies. |
| **T08 Review** | Final acceptance of AC01–AC06 | For each criterion, follow the links to task, commit, and evidence. Record status and unresolved gaps. Check that the final documentation describes the behavior and limitations of the candidate revision. |
| **T09 Breakdown** | Planning evidence for R01–R06 and AC01–AC06 | Confirm the approved plan has a complete map and the published task list matches it, including order and parent. This task records completion of decomposition. It carries no assertion about implementation or runtime behavior. |

At task closeout, record the Linear key, commit where applicable, verification result, and evidence link. At parent review, use this same map to connect each accepted criterion to the candidate revision. Keep an unmet criterion visible through closeout.

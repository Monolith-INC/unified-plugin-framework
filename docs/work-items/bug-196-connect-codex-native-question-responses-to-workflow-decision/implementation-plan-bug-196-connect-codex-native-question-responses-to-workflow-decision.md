---
type: implementation-plan
feature: ''
story: AGE-196
source_digest: 7a01a5e62a12a188c6c8fd6480214a265929748e97ba14f69f680888456a526d
skill: generate-breakdown-work-items
language: en
status: active
created: 2026-11-26
---

# Implementation Plan: Connect host adapter question responses to workflow decisions

## Context

The observed native control and decision continuation worked separately; the response was manually translated. Deliver an automatic handoff through a host-neutral interface, using only host capabilities verified for the supported versions. Apply the continuous-work article to question recovery; the article's wider product implementation is outside this bug.

## Acceptance criteria coverage

The [delivery traceability map](traceability-map.md) lists source requirements R01–R06, reproduces AGE-196 acceptance criteria as AC01–AC06, and maps them to planned tasks T01–T09 and their focused verification. It is the requirement register and verification matrix for this plan.

1. **A supported native response reaches the matching continuation automatically with its stable answer ID.** Establish the real host callback boundary; connect a documented, supported native response to the existing continuation and verify it once end to end.
2. **Custom answers retain their typed value, and unsafe or invalid responses cannot authorize an action.** Normalize fixed choices to answer IDs and custom answers to their typed value; bind decisions and accept each valid response once. Keep stale, duplicate, ambiguous, dismissed, unknown and unproven consent from authorizing effects.
3. **Decisions remain resumable and independent work continues across the recovery cases above.** Preserve pending decisions on dismissal, timeout, lost connection, unavailable controls and tool failure; ignore late callbacks after replacement and use a safe fallback while independent authorized work continues.
4. **Relevant recovery guidance is retrievable at the point of need from the existing knowledge mechanism.** Add discrete, indexed question-recovery guidance to the existing project knowledge mechanism and exercise retrieval in the applicable runtime context.
5. **Host-specific behavior is confirmed against the vendor's official documentation and installed version; unsupported behavior is identified.** Document evidence and limitations for each supported host; implement only supported boundaries, keeping vendor-specific details in adapters.
6. **Focused host-shaped automated coverage and a live native check establish the actual handoff, or document a verified host limitation.** Exercise documented response shapes and decision edge cases with focused tests; perform a live native check without manual normalization and record the evidence or the verified limitation.

## Ordered delivery steps

1. **Verify host boundaries.** Research official documentation and installed host versions. Record which question presentation and response channels are actually accessible, including limitations and a reproducible live check. Verification: review each claim against the vendor source and installed host.
2. **Define and implement the neutral response seam.** Extend the existing shared question contract with the smallest host-neutral input/output boundary; map fixed choices to stable IDs and preserve custom text. Derive display order and decoded keys from the same source. Verification: focused contract and ordering tests, including consent ambiguity.
3. **Connect supported host adapters and continuation.** Keep vendor translations in concrete adapters, deliver responses to the matching decision and enforce at-most-once handling. Verification: focused host-shaped and duplicate, stale, ambiguous and dismissal tests against the production continuation.
4. **Add continuous recovery.** Keep unanswered decisions pending and resumable; continue independent work and use existing safe fallbacks for unavailable, timed-out or failed channels. Record and safely recover problematic effects where applicable. Verification: focused timeout, disconnection, late-response and fallback tests.
5. **Index recovery guidance.** Add discrete question-specific timeout, escape and recovery guidance to the existing project knowledge and context mechanism. Verification: retrieve the relevant guidance at the point of need without a second store.
6. **Prove the end-to-end path.** Run the supported host's native interaction through the production adapter and continuation without manual translation; record observable results and any verified host limitations. Verification: one live check and focused automated coverage for the proven path.

Each delivery step is a separate, verifiable task and commit, in order. Add the harness's Staging, Review and Breakdown tasks during decomposition. Check each task against its own requirements and verification before marking it Done. Run the project's required final checks once at delivery, followed by the prescribed review and pull-request workflow.

Use T01's evidence to decide which native paths T03 can wire. If a host lacks a verified path, retain its existing fallback and continue independently verifiable work. T01 can close with an evidenced limitation. Keep AC01 open unless T06 demonstrates an automatic native handoff.

When drafting a task, copy its relevant requirements, acceptance conditions, and verification from the map into the task, with links to the source sections. At task closeout record the result, evidence link, and commit where applicable. At final acceptance use the same map to verify coverage against the candidate revision and check that the documentation describes the behavior and limitations that ship.

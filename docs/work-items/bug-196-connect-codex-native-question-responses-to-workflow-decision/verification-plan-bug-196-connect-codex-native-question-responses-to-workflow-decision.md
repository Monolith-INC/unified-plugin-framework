---
type: verification-plan
story: AGE-196
status: active
---

# Verification plan: Native answers reaching workflow decisions

Use the task checks in the traceability map for one focused pass per task. Record each result with the tested version or revision and the evidence link.

| What to verify | Evidence required |
| --- | --- |
| Host boundary | For each host and surface in scope, identify the installed version, official documentation, and focused probe result. Record the supported answer path or the verified limitation and fallback. |
| Answer and consent | Check stable IDs, literal custom answers, and choice ordering. Exercise matching, stale, repeated, ambiguous, and dismissed responses. Confirm a protected action requires a valid answer and runs at most once. |
| Recovery | Exercise timeout, disconnection, unavailable input, and late delivery. Confirm the decision stays resumable, independent work continues, and the existing knowledge mechanism supplies the applicable recovery guidance. |
| Automatic handoff | Capture a redacted live trace from one native answer through the production adapter to the matching decision. Record host, version, and candidate revision. Keep automatic delivery open if the live check cannot prove it. |

Run the required project checks once on the delivery candidate. Review the results against every acceptance criterion in the traceability map and record any gaps before closing the parent issue.

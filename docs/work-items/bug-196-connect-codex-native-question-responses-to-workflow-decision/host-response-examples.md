# Host Response Examples

These are proposed neutral contract examples, not claims about a vendor payload.

1. **Valid selection:** A staged decision has instance `review-7` and ordered keys `keep`, `revise`. A concrete adapter receives the documented host response that corresponds to `revise`. It emits the canonical answer for instance `review-7` and key `revise`; the continuation accepts it once.
2. **Stale or duplicate:** A response for `review-6`, or a second response for already-consumed `review-7`, produces no new answer and no protected action.
3. **Custom text:** A supported host reports a literal custom response. The adapter preserves its exact value and the shared contract requests clarification if required; it does not convert the text to consent.
4. **Dismissal and no reply:** A documented dismissal or an unavailable reply channel produces a dismissed or resumable needs-input state, never acceptance.
5. **Unsupported or ambiguous input:** A host returns an unrecognized field, duplicate label, or mismatched displayed order. The adapter reports an explicit failure rather than guessing the key.

**Proposal:** Use these examples in adapter conformance tests. Each concrete adapter must add fixtures grounded in its own official vendor documentation and actual installed-host observations.

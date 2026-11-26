---
type: risk-assessment
story: AGE-196
status: active
---

# Risk assessment: Native answers reaching workflow decisions

The earlier live check showed a native question and a human answer. An agent then passed the answer to the workflow manually. The delivery must establish that a supported host can pass the answer automatically through its adapter.

| Risk | Consequence | Control and verification |
| --- | --- | --- |
| A host displays native questions but offers no supported way for an adapter to receive the answer. | The team could ship a manual path as automatic or depend on an unsupported interface. | Check official vendor documentation and the installed version, then probe the accessible surface. Keep the existing fallback where the path cannot be verified. Require a live trace through the production continuation for automatic delivery acceptance. |
| A typed answer resembles an approval, or a response is stale, duplicated, or associated with the wrong decision. | A protected action could run without the required answer or run more than once. | Preserve the distinction between a choice and custom text. Bind an answer to the active decision and apply it once. Test ambiguous, stale, and concurrent responses, including attempts to authorize a protected effect. |
| A question times out or its channel fails while the workflow has other work to do. | The workflow could stop, lose context, or accept a late response after replacing the question. | Preserve the pending decision, continue independent authorized work, and retrieve the indexed recovery route. Exercise timeout, disconnect, fallback, and late delivery. Preserve incident evidence and use a verified recovery route if an effect has to be rolled back. |

The first delivery task establishes which host paths are eligible. A verified host limitation supports a fallback decision. Automatic handoff stays unaccepted until the live check demonstrates it.

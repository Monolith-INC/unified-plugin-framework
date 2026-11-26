# Self-Consistency Validation

Two independent source inspections reached the same conclusion: the existing vendor adapters generate payloads, while the shared workflow normalizes a canonical answer supplied by its caller. Neither inspection found a production bridge from an actual native answer to the continuation.

The two inspections also agree that the existing question contract should remain authoritative. A runtime host adapter must translate only documented host inputs and outputs, preserve the decision instance, and pass the result to that contract. It must not let vendor-specific parsing enter the shared workflow.

The inspections differ in emphasis: one found that existing portable hook intents do not model native questions; the other identified a possible mismatch between the displayed order and the saved order. Both require verification. A generic post-tool hook does not establish that a specific native question tool produces an observable callback.

**Proposed changes:** Add host-by-host callback and payload evidence to the acceptance checks; use one ordered choice representation for rendering and decoding; add a shared adapter conformance test and vendor-specific tests. Keep automatic delivery unproven until an actual host response reaches the continuation without a manually authored payload.

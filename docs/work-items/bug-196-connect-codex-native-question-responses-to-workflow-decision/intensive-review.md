# Intensive Approach Review

## Readiness and input reconciliation

The goal is one host-neutral answer adapter, not a separate vendor-owned workflow. Fixed selections return an answer ID; custom input retains its literal text. The existing shared decision contract remains authoritative. The prior Codex-only ticket title was corrected to this scope. AGE-196 still needs association with the Unified Plugin Framework project because the tracker gateway did not set one.

The source-level behavior to preserve is in `question-channel.ts`, `discovery-next.ts`, and their existing tests. The installed payload adapters are compile-time adapters, so the runtime integration boundary remains to be established. The draft is not implementation-ready until the supported callback and continuation owner are identified.

## Risks, boundaries, and adversarial cases

1. A host may not emit a supported native question callback. Do not claim automation without an observed supported event.
2. Generic hook support may exclude a particular question tool. Verify the tool and version separately.
3. A string-only host response may conflate an option label and identical custom input. Do not infer consent when the source is ambiguous.
4. A fallback may display options in a different order from saved keys. Derive both from one ordered representation.
5. Duplicate labels can resolve to multiple keys. Reject ambiguity.
6. A stale answer from an earlier decision or revision can reach the current workflow. Bind and validate at the host boundary.
7. Two callbacks can both read an unanswered snapshot. The continuation owner must consume at most once and make protected effects idempotent where needed.
8. A late native callback may arrive after text fallback. Invalidate the prior route and do not apply both.
9. An empty multi-select, timeout, dismissal, and missing callback have different meanings. Preserve only outcomes established by the host and never infer approval.
10. Host availability can vary by mode, installation, trust, and version. Select a safe channel from observed capabilities and record the test environment.
11. Hook output may be redacted or suppressed. Fail safely instead of interpreting missing data as an answer.
12. A process may not own the currently running desktop client. An app-server integration must not be presented as proof for that client without a live check.

## Technical choices and assumptions

A common runtime adapter contract with concrete vendor adapters fits the user's architecture. Existing `VendorAdapter` instances compile payloads and are not proven to be runtime transports. Whether to extend that contract or compose a separate runtime capability remains a code-level decision, based on actual host support. Official documentation is required for each vendor-specific behavior; generic documentation is not evidence for a specific tool's callback.

## Source preservation and verification gaps

Leave inherited dependency sources and unrelated archived AGE-113 material unchanged. Test actual vendor-shaped payloads, shared adapter conformance, and live end-to-end delivery without manually constructing a canonical response. Record installed host versions and distinguish documented, observed, and unavailable behavior. If no supported transport is available for a host, verify the fallback and report automatic delivery as unverified for that host.

# Reasoning via Planning

## Sequence

1. Establish the supported host callback and payload from vendor documentation and a version-specific observation. If unavailable, record that limitation and use the safe fallback.
2. Define one host-neutral runtime adapter contract and an immutable ordered decision representation shared by presentation and decoding.
3. Implement concrete adapters only for documented, observed host capabilities. Keep vendor payloads at the edge and pass canonical results to the existing shared decision logic.
4. Verify stable IDs, order, custom answers, dismissed and stale responses, exactly-once consumption, revision binding, and unattended behavior with focused conformance tests.
5. Run a live native control through the production adapter and continuation without manually creating the normalized response. Record host version, setup, observable result, and gaps for other hosts.

## Risk and proposal

An adapter cannot receive events from a host that exposes no supported callback or from a desktop client UPF does not own. Do not promise universal automatic integration based on generic hook or app-server documentation alone. Support each verified host through the common interface, with explicit fallback elsewhere.

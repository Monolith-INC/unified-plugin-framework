# Decision Scaffolding

## Evidence and conclusions

- The current shared continuation is stateless at the CLI boundary; callers supply the decision instance, response, and answered flag. The application needs a defined owner for pending state and exactly-once consumption.
- Codex documents app-server user-input events, while generic hook coverage has exceptions. Confirm the specific callback in the actual desktop host before implementing a concrete integration.
- Claude documents native question input and generic post-tool responses; Cursor documents generic tool hooks. Neither fact alone proves the exact question callback payload in the installed host.
- Shared choice order must be the same order rendered and decoded. Ambiguous labels, stale instances, cancellation, and unknown response types must fail safely.

## Proposal

State these evidence boundaries in the adapter contract and its acceptance tests. Require a supported, observed host event and a production continuation result for each host claimed to be automatic. Preserve text and needs-input fallbacks when the proof is absent.

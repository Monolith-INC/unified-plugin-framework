# Boundary and Security Review

Two independent reviewers examined the draft and the merged question contract. They identified these concrete checks:

1. Bind the callback to the host connection, workspace, conversation, request and question IDs, decision instance, and reviewed revision where applicable. Reject forged, cross-session, stale, and superseded callbacks.
2. Define a single owner for atomic answer consumption and idempotency of separately executed protected effects. Test simultaneous duplicate callbacks, reconnect replay, and a late native answer after fallback.
3. Do not treat a string equal to an approval label as explicit consent unless the host payload distinguishes selection from identical custom input. Otherwise use a safe fallback.
4. Distinguish an explicit empty multi-selection from dismissal, timeout, missing delivery, and acknowledgments.
5. Derive the visible option order and decoded keys from one source. Test reordered recommendations and confirmation choices.
6. Test native delivery failure after selection, not only unavailability before presentation. A late native callback must not advance a decision after it was rerouted.

The current CLI accepts caller-supplied context and response JSON. A matching instance string alone does not prove the response came from the owning host transport. Host-specific payload and callback behavior remains subject to official documentation and live verification.

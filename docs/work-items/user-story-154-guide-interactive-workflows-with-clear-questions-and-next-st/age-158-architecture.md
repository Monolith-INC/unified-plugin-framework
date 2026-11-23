# AGE-158 architecture

The approved plan requires one pure storyboard transition owner and continuation through the existing question boundary.

Two designs were considered: an immutable current snapshot with explicit events, and an event log replayed to reconstruct the snapshot. Both can derive valid edges from the existing storyboard and bind a decision to session, occurrence and review revision. The event log introduces a new persistence contract that this slice does not need, so the snapshot design is used. Two independent design sketches were requested; their workspace reads were blocked by the harness assignment guard, so their suggestions were checked against the actual source and approved plan in this checkout.

`nextDiscovery(state, event)` accepts a current snapshot and explicit event, uses the existing storyboard for valid targets, and returns an updated snapshot with predetermined guidance or a typed recovery. `prepareQuestion` and `normalizeQuestionAnswer` remain the only question transport and answer normalization. A waiting snapshot retains its prepared question and continuation; pause wraps the snapshot, and a changed review revision creates a new occurrence. Persistence and presenting the question belong to the caller. The existing `question next` CLI boundary exposes the same pure function; it adds no daemon or state store.

Decision identities encode the session, occurrence and reviewed revision as a JSON tuple. The caller must preserve the returned state and provide the currently shown review revision. Concurrent persistence, when present, must compare the previous snapshot before replacing it; this slice does not provide a persistence adapter.

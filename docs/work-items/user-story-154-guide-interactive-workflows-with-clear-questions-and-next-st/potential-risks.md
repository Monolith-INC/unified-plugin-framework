# Potential risks: guided interaction delivery

Proposed additions for AGE-154 and its first slice, AGE-155; these have not yet been incorporated into the approach.

1. **Scope and sequencing:** the parent contains seven independently deliverable slices. Implement and deliver AGE-155 first; retain later interaction-guidance changes without treating them as part of the completed first slice unless they are necessary for its acceptance criteria.
2. **Existing work:** two checkouts now contain copies of the uncommitted follow-up. Establish one authoritative implementation checkout and preserve all source material and later-slice changes before modifying or delivering either copy.
3. **Configuration rollout:** an opt-in flag may be ignored by an untrusted project or unsupported host. Explain the observed limitation and retain a usable fallback instead of silently changing trust or global configuration.
4. **Decision safety:** defaults, cancellation, and unanswered prompts must not become affirmative consent. A session with no response channel must yield a recoverable pending decision rather than run a protected action.
5. **Verification gaps:** unit tests cannot prove that a host displays a control or that an existing session reloads configuration. Record the supported host, version, setup and observed results; state any test that cannot be completed.
6. **Dependency and payload drift:** preserve bundled dependency sources, test existing host assembly and release paths where affected, and distinguish scoped verification from full specification compliance.

# Adapter approach comparison

## Goal

Connect real host responses to the shared decision contract while keeping vendor-specific input and output in concrete adapters.

## Paths

1. **Agent-guided CLI handoff.** Reuse the current stateless commands and ask the agent to translate host replies. This works with existing guidance but does not satisfy the requested automatic integration and leaves key mapping dependent on the agent.
2. **Host-specific callbacks behind a shared runtime interface.** Define a host-neutral input/output contract, implement a concrete adapter where the vendor documents and exposes a usable callback, and call the existing decision normalization with the captured continuation. This can provide an automatic path, but only when the installed host confirms callback coverage and reliable identity.
3. **Own the host client through its protocol.** Run a supported host client and translate its explicit user-input events behind the same interface. This gives the client control over callbacks, but changes deployment and cannot be assumed to control an already running desktop session.

## Recommended direction

Use path 2 when documented and verified for the installed host. Treat path 3 as a separately evaluated integration only where UPF actually owns the host client. Where neither is supported, preserve the existing safe fallback and report the limitation instead of claiming automation.

## Checks and risks

- Derive displayed options and stable keys from one ordered source. Reject duplicate or ambiguous labels, stale instances, repeated callbacks, and missing explicit consent.
- Distinguish selection, custom text, dismissal and timeout using the specific host's documented and observed data. Do not assume all hosts expose the same event or payload.
- Keep continuations isolated by session and decision, consume each once, and check review revision before any protected effect.
- Test cancellation, unavailable hooks, unsupported runtimes, concurrent decisions, and reply-channel absence. A live test must show that an actual host event reaches the continuation without a manually authored normalization command.
- Confirm behavior against official vendor documentation and the installed versions. Codex app-server and generic hook documentation do not alone prove desktop question-tool hook coverage; Claude's hooks document generic tool input and output; Cursor's generic post-tool hook does not specifically establish question callback coverage.

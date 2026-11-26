# Assumption audit: Codex project question configuration

Proposed findings for AGE-155; these have not yet been incorporated into the approach.

1. **Feature availability — uncertain:** the locally observed Codex CLI 0.171.0 lists `default_mode_request_user_input` as under development. Check the supported host version and actual control availability; do not promise the flag works on every version or client.
2. **Project trust — documented:** OpenAI states that project `.codex/config.toml` is loaded for trusted projects. Verify trusted and untrusted behavior without changing trust on the user's behalf.
3. **Session reload — uncertain:** do not assume a configuration change affects a session already running. Compare a pre-existing session with a newly launched session and document the observed behavior.
4. **TOML editing — unproven:** semantic parsing can establish the existing value, but does not by itself preserve comments or make every syntax shape safely editable. Test the actual editor on representative inputs and refuse unsafe edits.
5. **Noninteractive continuation — unproven:** a headless host may lack both structured input and a reply channel. Locate the existing caller's continuation contract before implementing needs-input; do not invent a second workflow store.
6. **Prototype ownership — established but incomplete:** the uncommitted host setup and question-guidance changes are copied into the AGE-155 checkout. Classify them against the first slice and preserve the remaining work without treating it as already delivered.

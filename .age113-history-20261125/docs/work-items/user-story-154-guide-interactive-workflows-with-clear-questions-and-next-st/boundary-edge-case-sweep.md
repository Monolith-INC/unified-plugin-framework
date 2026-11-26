# Boundary and edge-case sweep: Codex project question configuration

Proposed additions for AGE-155; these have not yet been incorporated into the approach.

1. **Consent and existing values:** test missing consent, explicit decline and opt-in against absent configuration, existing true and existing false. Preserve either explicit value, including false; reruns must be idempotent.
2. **Valid TOML shapes:** cover quoted and dotted keys, inline tables, table headers with comments, multiline strings, CRLF, Unicode, dates and nonfinite numbers. A same-named key outside `features` or text inside a string must not count as the feature.
3. **Invalid or ambiguous inputs:** reject invalid TOML or a `features` value that cannot contain the setting without changing the file. A valid shape that the chosen editor cannot preserve must fail safely with a clear recovery path.
4. **Filesystem boundaries:** test a missing `.codex` directory; symlinked directory or file; a directory or FIFO at the file path; permission errors; and a concurrent edit between read and replace. Unsafe inputs must not block or alter another file.
5. **Runtime boundaries:** distinguish project trust, a newly started session, an existing session, and noninteractive execution. If no usable reply channel exists, return needs-input promptly; do not treat an empty response, a default or dismissal as consent.

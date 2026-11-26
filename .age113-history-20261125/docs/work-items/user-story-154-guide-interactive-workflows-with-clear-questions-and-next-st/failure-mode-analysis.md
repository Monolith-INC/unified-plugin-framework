# Failure Mode Analysis: Codex project question configuration

Proposed findings for AGE-155; these are not yet incorporated into the approach.

1. **Unrequested configuration:** the current prototype writes during host registration, including runs without a separate opt-in. Carry a default-off accepted choice through every registration path, and keep declined and legacy plans ready without the setting.
2. **Configuration corruption:** regex matching can confuse quoted or dotted keys, inline tables, comments, and multiline strings. Parse the existing document semantically and validate the resulting edit; preserve explicit values and unrelated content. If a safe edit cannot be established, return a recoverable failure without writing.
3. **Unsafe file handling:** a symlink, special file, or concurrent edit can redirect, block, or overwrite configuration. Use confined, regular-file reads and compare-before-replace writes; exercise each failure without modifying the target.
4. **Question channel unavailable:** a structured picker being unavailable does not establish that a text reply is possible. In unattended execution return a needs-input outcome without waiting on stdin or taking the protected action.
5. **False completion evidence:** an enabled flag does not establish that a trusted project, a running session, or a noninteractive host exposes a usable question tool. Verify these separately and record the host version and observed limits.

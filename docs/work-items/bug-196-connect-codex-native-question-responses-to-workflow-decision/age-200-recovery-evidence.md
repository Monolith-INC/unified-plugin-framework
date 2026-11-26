---
type: task-check-evidence
story: AGE-196
status: active
---

# AGE-200 verification

Commit `204f29e` gives the Codex form a 60-second deadline. Timeout, disconnect, dismissal, or tool failure preserves the unanswered workflow step and replaces the failed prompt. The replacement uses text when available or stays pending until input reconnects. The old response cannot answer the replacement.

- The CLI build and 17 focused tests passed. They exercised timeout, dismissal, disconnection, tool failure, unavailable input, fallback, reconnection, and a late answer. An independent decision completed while a different form was stalled.
- With the installed Codex app server, cancelling an inert form through a test client returned a text decision at the same workflow step with a fresh instance.
- The staged diff passed the whitespace check. These recovery paths did not perform an external action that required rollback. The indexed recovery guidance and live human answer remain separate tasks.

---
type: task-check-evidence
story: AGE-196
status: draft
---

# AGE-202 live Codex handoff

Codex CLI 0.171.0 ran in a desktop terminal against UPF revision `18f18725c939d0e52afdad9dc18598656a5c4c3e`. Its MCP tool called the built `agent-plugin question serve-codex` handler with an inert discovery state at `context`, occurrence `0`. The terminal used a read-only sandbox and normal tool permission controls.

The recorder forwarded the protocol unchanged and saved only these event fields:

```jsonl
{"event":"tool-called"}
{"event":"form-sent"}
{"event":"form-answered","action":"accept","choice":"choice:execute"}
{"event":"tool-returned","kind":"ready","node":"execute","occurrence":1,"phase":"active"}
```

The person selected **Proceed with a clear request** in the native form. The production UPF continuation returned `execute` at occurrence `1`. No manual answer command or workflow action was part of this test. This verifies automatic handoff on the Codex terminal surface. Claude Code and Cursor validation remain separate follow-ups.

---
type: task-check-evidence
story: AGE-196
status: active
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
## Follow-up from the assembled discovery skill

On 2026-11-26, the Codex 0.171.0 terminal followed the assembled quick-discovery skill with an inert workflow at node `context`, occurrence `0`. The first call used the language name `English` and returned a wording recovery on the same state before presenting a form. The skill recovered by calling the registered tool with `en`. The human chose **Discuss the request** in the native form. The passive MCP trace recorded the stable answer `choice:conversation`, followed by `ready` at node `conversation`, occurrence `1`. The test ended at the returned state. It did not submit a manual answer event or make project changes.

The observed runtime revision was `913ccdec1823b07dfd0fa139ab49e006c88b1ef2`. The follow-up specifies language tags in both the generated instructions and tool schema. The live evidence applies to Codex CLI. The automated tests separately exercised Portuguese question wording and literal custom input.

# Cursor IDE native handoff validation

**Status on 2026-11-26:** Verified on the Cursor IDE MCP compatibility probe. Keep the existing Cursor fallback while Claude Code validation remains open.

- **Surface:** Cursor IDE 3.32.4 for Linux x64, build `0925c4b8226c56947c43f0b555fb98e187a7e020`. This probe covers IDE MCP. Cursor CLI ACP requires independent validation.
- **Runtime:** Merged UPF revision `fa663c9`. The isolated workspace registers a local stdio fixture in `.cursor/mcp.json`. The fixture uses the shipped MCP server to test compatibility without enabling a production Cursor adapter.
- **Observed:** After the test server was enabled and the prompt submitted, Cursor initialized with MCP revision `2025-11-25` and advertised form support. The passive trace records one tool invocation and one native form. The host delivered the accepted stable choice `choice:conversation`.
- **Result:** UPF returned `ready` with node `conversation`, occurrence `1`, and phase `active`. The probe started at `context`, occurrence `0`. The recorder forwarded the protocol without translating or submitting the answer.
- **Scope:** This verifies a real Cursor IDE native answer reaching the existing UPF continuation through the test server. Cursor CLI ACP and a production Cursor adapter were outside the probe. The initial attempt stopped before initialization while the project server was disconnected.


[Official Cursor MCP documentation](https://cursor.com/docs/mcp#protocol-and-extension-support)

# Claude Code native handoff validation

**Status on 2026-11-26:** Blocked before tool invocation. Keep the existing Claude Code fallback.

- **Surface:** Claude Code 2.1.331 interactive Linux terminal. The test used a temporary workspace and registered one local stdio MCP server for the session.
- **Runtime:** Merged UPF revision `fa663c9`. The compatibility fixture used the MCP server shipped for Codex to test the wire contract. It did not install or enable a production Claude Code adapter.
- **Observed:** The real Claude Code client initialized at MCP revision `2025-11-25` and declared form support. Its model turn reported that the signed-in subscription could not be used. The trace contains an initialization event and no tool invocation, form request, answer or UPF transition.
- **Remaining acceptance evidence:** A native selection reaches the requesting server and UPF returns `ready`, `conversation`, occurrence `1`, from the saved `context` state at occurrence `0`. A fixture-generated answer would not establish the live user path.

[Official Claude Code elicitation documentation](https://code.claude.com/docs/en/mcp#respond-to-mcp-elicitation-requests)

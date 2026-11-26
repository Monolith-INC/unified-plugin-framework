---
type: host-boundary-evidence
story: AGE-196
status: active
---

# AGE-197 — Native question boundaries

Scope: the Codex, Claude Code, and Cursor adapters shipped by UPF. An IDE, a command-line client, and an embedded client are separate surfaces. A documented protocol or generated schema qualifies a candidate for a focused probe. A real answer reaching a production UPF continuation is a later check.

| Host and installed version | Official boundary and local evidence | Delivery disposition |
| --- | --- | --- |
| Codex CLI 0.171.0, app server | [App Server, tool input and MCP elicitation](https://learn.chatgpt.com/docs/app-server#toolrequestuserinput). Fresh schema generation produced a question-ID map to string arrays for built-in input and a separate structured MCP result with `accept`, `decline`, and `cancel`. The same request-resolution notification may also mean cleanup. | Built-in response payloads belong to the client that answers the request. Label-only strings alone cannot distinguish fixed choices from matching custom text for protected decisions. Probe server-owned MCP form elicitation separately. |
| Codex Desktop, this chat | The earlier native review displayed controls and a genuine user answer reached this chat. The agent manually forwarded a normalized answer. The desktop path from an installed UPF adapter to the continuation remains unverified. | Preserve the existing text reply or unattended needs-input behavior until a supported adapter path is demonstrated. |
| Claude Code 2.1.331 | [MCP elicitation](https://code.claude.com/docs/en/mcp#respond-to-mcp-elicitation-requests) documents returning structured terminal input directly to the requesting MCP server. The installed version is above the documented 2.1.287 capability floor for older protocol revisions. [ElicitationResult](https://code.claude.com/docs/en/hooks#elicitationresult) is specific to MCP elicitation. Native `AskUserQuestion` is a distinct tool. | Start with server-owned form elicitation. Confirm the installed connection advertises it and that the response arrives. Generic post-tool hooks are insufficient evidence of a native-question callback. Use the existing fallback on an unverified surface. |
| Cursor IDE 3.32.4, build `0925c4b8226c56947c43f0b555fb98e187a7e020` | [Cursor MCP capabilities](https://cursor.com/docs/mcp#protocol-and-extension-support) list elicitation. [Cursor CLI ACP](https://cursor.com/docs/cli/acp) documents a separate client-owned question route with question IDs, selected option IDs, and skipped or cancelled outcomes. The standalone `agent` and `cursor-agent` commands were absent. The IDE's launcher attempted to install the CLI and the sandbox could not resolve cursor.com. | The ACP contract does not establish IDE hook delivery, nor is the CLI probe available with the installed tools. The IDE's actual MCP answer path remains unverified. Preserve the existing fallback for both unresolved surfaces. |

## Probes and results

`codex app-server generate-json-schema --out <temporary-directory> --experimental` generated `ToolRequestUserInputResponse.json` and `McpServerElicitationRequestResponse.json` with the response shapes above. This is a local schema check. It sent no question and captured no real answer.

**Codex app server — protocol round trip passed.** A temporary stdio MCP server advertised one inert tool. An ephemeral app-server thread called it using `mcpServer/tool/call`. The host advertised form and URL elicitation at MCP protocol revision `2025-06-18`. The tool requested a form with two fixed IDs. The app server emitted `mcpServer/elicitation/request` for that server. The test client returned `{"action":"accept","content":{"choice":"option_b"}}` and the requesting MCP server received that result intact. The client supplied a fixture answer. The probe verifies the installed app-server transport, with a real human answer and the production UPF continuation still to be verified.

**Claude Code — capability observed.** The installed binary connected to a temporary stdio MCP fixture configured for a single print-mode session. The MCP initialize request advertised `{"version":"2025-11-25","elicitation":{"form":{},"url":{}}}`. The command exited with status 1 without completing a response probe. The documented route and the capability agree. Runtime answer delivery remains unverified.

**Cursor — IDE response path unresolved.** The installed version was confirmed. The installed bundle did not expose a standalone Agent CLI binary, and the IDE launcher could not finish obtaining it in the sandbox. ACP and IDE MCP are distinct surfaces. A CLI installation would allow a separate ACP probe, while proving IDE support still requires an interactive IDE session with a local MCP fixture. Keep the text and unattended fallbacks for the unverified surfaces.

## Decision

The delivery decision on 2026-11-26 selects server-owned form elicitation through the verified Codex app-server protocol. Retain the neutral answer contract: a stable ID for a choice and literal text for custom input. Cancellation and unqualified responses leave the decision pending. Keep the existing Claude Code and Cursor fallbacks. The live human-to-production handoff is still required in AGE-202.

## Follow-up validation

- **Claude Code:** Connect an inert MCP fixture in an interactive terminal. Request a form and confirm that the selected stable ID reaches the requesting server. The earlier run verified the advertised capability.
- **Cursor IDE:** Connect the same fixture in an interactive IDE session and verify form presentation and delivery of the selected stable ID. Track CLI ACP as a separate surface if tested.

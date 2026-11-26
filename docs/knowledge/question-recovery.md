# Native question recovery

A native prompt can fail without answering the workflow's question. Keep the workflow step pending, use the replacement decision, and continue independent work. A replacement has a fresh answer identity. Apply an answer only to that identity and the matching review revision.

| Recovery unit | Read when | Guidance |
| --- | --- | --- |
| `3-mechanics/question-timeout` | A native prompt reaches its deadline. | Use the replacement decision. Offer its numbered text choices when replies are available. Otherwise retain the pending decision until input reconnects. Ignore any answer to the expired prompt. |
| `3-mechanics/question-disconnect` | A native prompt loses its connection or its caller cancels. | Retain the pending workflow state. Reuse the returned replacement, or recover the saved native decision if the connection closed before returning it. Reconnect when possible and ignore replies to the retired prompt. |
| `3-mechanics/question-dismissed` | The person dismisses or declines the input form without submitting an answer. | Keep the decision pending. Continue independent work and use the returned fallback when input is needed again. Dismissal does not select a workflow option or authorize an action. |
| `3-mechanics/question-unavailable` | A native form fails or returns an unusable answer. | Use the returned text or unattended decision. If native input keeps failing, continue independent work and report only a decision or action that genuinely requires the person. Never infer an answer from the failure. |

Index these units in the configured Project Knowledge store through `maks curate`, using this document as the source. Fetch an existing unit before updating it and pass its current version. For a new unit use `--if-version new`. Use the exact IDs above so the runtime can request only the applicable guidance.

In a bootstrapped project, pass the absolute path to the existing trusted `.upf-tools/bin/maks` launcher as `--knowledge-launcher` when registering `agent-plugin question serve-codex`. The adapter returns a recovery unit ID and, when available, its current guidance. If the launcher or unit is unavailable, the replacement decision is still usable.

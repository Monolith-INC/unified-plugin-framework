# AGE-215 Codex Desktop verification

Tested the reviewed build from `f69aab2afee866a0526adb95902fcb6bf391e6ad` in a disposable Daybook project. The user made the choices in Codex Desktop.

| Requirement | Observed result |
| --- | --- |
| [FR-002](adr.md#fr-002) | The transcript shows the saved design link and its full SHA-256 revision before the approval prompt. The approval returned `complete` with that revision. The saved draft's file digest matches the returned revision. |
| [FR-003](adr.md#fr-003) | The session recorded completed brainstorming and Forge Idea results, including the Forge memlog and HTML report. The Adversarial and Edge-case Hunter lenses recorded 11 and 7 findings respectively for the same file and revision. |
| [FR-004](adr.md#fr-004) | `1, 2` selected both requested optional passes. An actual native direction choice returned `conversation`. A later prompt timed out. The user requested a retry, selected the written-design direction, and the tool returned `sizing`. The same session continued to review and approval. |
| [FR-006](adr.md#fr-006) | A separate Desktop session offered a numbered optional selection. The user's literal `none` returned an answer with zero keys. Discovery saved `selected: []`, activated the required lead pass, and continued to the project direction prompt. That prompt timed out and returned a pending text fallback. The `none` test stopped there. |

Approved test draft SHA-256

```
8691390e4f505e09ea42ffbc4236170b9f6d100d7590b88c479621e457f6ab6e
```

The disposable project retains the raw records under `desktop-evidence/`. These hashes identify the copies used for this verification.

| Record | SHA-256 |
| --- | --- |
| `DAY-002-discovery.json` | `9b05ca5292fb3643d1a4b24ffdf6bb9e9b4d3935933e8469ba4598d1e9d1f35d` |
| `DAY-002-none-discovery.json` | `ea65051369683076983b37625b3ec5afdda6f2df772af69d0d2055aa92bce1b4` |
| `DAY-002-review.json` | `7761e138f2e55c7493f328a12679d728ce0bc203f53391680508a2b5530012a3` |

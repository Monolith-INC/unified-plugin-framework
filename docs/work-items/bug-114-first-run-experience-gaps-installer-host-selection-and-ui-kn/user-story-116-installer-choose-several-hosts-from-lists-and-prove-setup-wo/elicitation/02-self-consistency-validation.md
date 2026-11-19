# Self-Consistency Validation: the "not ready" signal and the host lists

Two decisions were each worked out three independent ways, then compared.

## 1. How the installer ends when knowledge is missing

| Approach | Fresh interactive install | Fresh CI install (`--input`) | Meets "does not report success" |
|---|---|---|---|
| a. Exit 2, "Installed, not ready yet" + next actions | Clear | CI can treat 2 as "installed, follow-ups pending" | Yes |
| b. Exit 0, JSON `ready: false` | Terminal still looks like success | CI must parse JSON | Weak: the exit status says success |
| c. Exit 1, failure | Reads as broken although files are installed | Every fresh CI install fails, since a new store is always empty | Yes, but wrong meaning |

Consensus: **a**. Checked against the source:

- `scripts/install.sh` runs `node install.mjs` last under `set -euo pipefail`, so exit 2 reaches the caller unchanged.
- Today only `knowledge-content`, `knowledge-server`, `review` and `tracker` are follow-ups (`FOLLOW_UPS`); anything else already stops with exit 1. The change splits follow-ups into **readiness** (`knowledge-content`, `knowledge-server`: exit 2, "not ready yet") and **routine** (`review`, `tracker`: exit 0 with the follow-up list, as now). Treating all four as exit 2 would also block CI on review bindings, which AGE-116 does not ask for.
- Gap found: `bootstrapReport` and `announced` in `scripts/install-release.mjs` have **no tests**, and the file runs `main()` at import, so they cannot be imported. Move the report classification into a pure module beside the wizard (`packages/cli/scripts/install-report.mjs`), imported from the extracted release like the wizard is, and test it directly.

## 2. How "all hosts" is offered

| Approach | Discoverable | Consistent with workflows list |
|---|---|---|
| a. Hidden `a` key toggles all | Only if the hint is read | Yes |
| b. An "All hosts" row at the top of the checklist | Yes, visible | Yes, if workflows get "All workflows" too |
| c. A separate yes/no "Install for all hosts?" question | Yes | Adds a question |

Consensus: **b**, with `a` kept as a shortcut shown in the key hint. The row toggles every item; it shows as ticked when all are ticked.

## 3. How the wizard gets the pickers

Three shapes compared (pickers inside `io.ask`; a new `io.select`/`io.check` capability; a separate picker object passed in options). All three agree that tests must drive the real collection flow with scripted answers, as `installer-wizard.test.mjs` does today. The capability shape keeps that pattern: `collectInstallation(io)` receives `{ask, say, check, select}`, the terminal boundary builds them from `installer-picker.mjs`, and tests script them like `ask`.

## Proposed changes to the approach

- Matrix row "Empty store" and "Server silent": exit 2 only for `knowledge-content` / `knowledge-server`; `review` / `tracker` stay routine follow-ups with exit 0.
- New task: `packages/cli/scripts/install-report.mjs` (pure report classification), used by `scripts/install-release.mjs`, with its own tests.
- Picker task: "All" row plus `a` shortcut, for hosts and workflows.
- Wizard task: `io` gains `check` and `select`; tests script them.

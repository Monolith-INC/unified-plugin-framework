---
name: bmad-design-handoff
description: Use BMAD's configured visual tools to generate mockups, then resume with the user's selection and capture the result in both BMAD design documents.
---

# BMAD design handoff

Use this skill from the interactive BMAD design handoff or when the user asks to resume one. Work in the same BMAD design workspace that contains `DESIGN.md` and `EXPERIENCE.md`. If this is a new design, use BMAD UX Discovery to open the workspace and capture the brief first. Reuse its decision log and apply BMAD's document conventions.

Find the project-local launcher at `<project>/.upf-tools/bin/agent-plugin`. The commands below abbreviate that path as `agent-plugin`. In a framework source checkout use `pnpm agent-plugin`. Use absolute workspace and input paths. If setup selected a private or custom Python, read its `python` setting from the project's `.upf-tools/setup-plan.json` and pass `--python <executable>` immediately after `design-handoff` on each command.

If resuming without a known path, resolve BMAD's configured output folder and active initiative. Look for `.upf-design-handoff/state.json` in that initiative's design runs. Inspect the matching workspace. Ask the user which run they meant if several match, or for its path if none match.

Run `agent-plugin design-handoff inspect <workspace>` first.

## Collect mockups

For an empty handoff, read the active BMAD UX customization and use its configured creative tools for the brief. Use a visual tool suitable for the choice, such as its design directions or wireframe. Preview the resulting artifact before showing it.

If generation stops early, keep the original brief and decision log in the workspace and leave the completed renderer files in `.working/`. On resume, read that material and run `inspect`. If there is no saved choice set, recover the completed files and finish collecting the options before asking for a selection. If a set is already saved, use its stored order and files.

Prepare an input file with `{"provider":"bmad","paths":["<absolute mockup file>", "..."]}`. Order the paths by how the mockups were shown, independent of generation order. Each path must identify a durable, standalone mockup. For an HTML mockup with companion files, save a screenshot or export it as standalone HTML before recording it. If a displayed option cannot be matched to a file, ask for the original image or a clear selection before advancing.

Run `agent-plugin design-handoff record <workspace> <options.json>` before asking the user to choose. Use its numbered options for the choice. Stop for the user's selection. The saved alternatives live in `.upf-design-handoff/` and are separate from the artifacts BMAD distills. When a BMAD renderer writes alternatives to `.working/`, keep those alternatives out of finalization, and pass only the chosen import as the mockup reference.

## Resume and return the result

- **Awaiting choice.** Read the numbered files from `inspect`. Show the saved choices if needed. Once the user chooses unambiguously, run `agent-plugin design-handoff select <workspace> <number>`. The result identifies the verified file under `imports/`. If the command reports a missing or changed file, recover the original before proceeding. To restore a missing saved mockup, rerun `record` with the original set.
- **Selected.** If the import was interrupted, retry `select` with the saved number. Inspect the returned mockup and reconcile it with the brief and user feedback. Record the selected path and feedback in BMAD's decision log with its existing append command. Check for an entry for that path before retrying.
- **Finish.** Use BMAD's guidance, the decision log, original brief, and selected mockup to draft visual decisions and behavioral flow. Mark unconfirmed behavior as assumptions. Prepare a JSON object with `design` and `experience` Markdown strings, without a selected-mockup link in either string. Leave both documents untouched until `agent-plugin design-handoff finish <workspace> <decisions.json>` succeeds. This command verifies the import before writing visual decisions to Layout & Spacing, flow to Key Flows, and one relative mockup link to each file. If verification fails, ask the user to clarify the selection or recover the original before editing either document.
- **BMAD validation.** After the handoff finishes, apply BMAD's status and validation rules. Preserve the handoff notes and their links during any later document edits.
- **Writing.** Run `agent-plugin design-handoff finish <workspace>` to finish an interrupted document update using the saved decisions.
- **Finished.** Verify the imported image and both document links before reporting completion.

Keep the mockup in the BMAD workspace. The user can review it from either document.

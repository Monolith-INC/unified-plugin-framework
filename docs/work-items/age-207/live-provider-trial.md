# AGE-209 live provider trial

- Candidate commit: `5ee21a9a41c2e160bdc325f268ed68eb04298af5`.
- Disposable workspaces: `/home/bhave/Projects/age-209-live.iNU7at/`.
- Both workspaces received the candidate Codex skill through the source installer. The installed skill matched the committed source byte for byte. Both used the same fictional Daybook brief.

## AC-FR-001-2 — BMAD fallback exercised

The host lacked Product Design. The candidate's provider command returned `bmad`. Python 3.12 ran the pinned BMAD 6.12.0 resolver. Its returned creative-tool registry included `file:assets/design-directions.md`.

The host delegated the actual bundled BMAD Design Directions Renderer to a live renderer agent, passing the original BMAD renderer prompt and the workspace brief and decision log. The renderer produced three self-contained HTML mockups in `.working/`: Neighborhood Desk, Pickup Slip, and Branch Guide, in that order. Headless Chrome rendered previews for all three. The candidate's `record` command saved the options in the recorded order and returned `awaiting-choice`.

The test operator selected Option 2, Pickup Slip, through the candidate's `select` command. The renderer's original file, saved option, and imported file all had SHA-256 `e5b08443df8770d51cff7297aaaf59003dd2652bb7e0d67d368fd36f757b9775`.

The `bmad-fallback/` evidence directory contains real installer, resolver, provider, record, and select output, plus previews and `selected.sha256`. This note summarizes events from the live test and is not a chat transcript.

## Product Design experiment — outside AGE-207 acceptance

The plugin catalog listed Product Design as available and uninstalled. The test host had image generation. The separate candidate workspace and brief are ready. A Product Design run can be revisited if the experiment is taken forward.

The BMAD result is evidence for AC-FR-001-2. A live Product Design run is no longer an AGE-209 gate. No changes were made to the staged review snapshot.

## BMAD-only candidate replay

After the experimental routing was removed, the revised Codex skill was source-installed into a new disposable project at `/home/bhave/Projects/age-209-bmad-only.v3CUaU/project`. The installed skill matched the revised source. The pinned resolver still returned BMAD's Design Directions Renderer in the creative-tool registry. The revised handoff recorded the three HTML files from the original live renderer run in the same order and imported Option 2 without a provider-selection command. Source, saved option, and import again matched SHA-256 `e5b08443df8770d51cff7297aaaf59003dd2652bb7e0d67d368fd36f757b9775`. The evidence folder contains the revised installation, resolver, record, select and hash outputs.

# Project tracking workflow

Turn an approved design into enriched, validated work items, implementation plans and atomic tasks. Resume existing work, preserve accepted scope and publish through the project's configured adapter. The project owns language, tracker selection and artifact locations.

## Contract v1

| Framework skill | Outcome |
| --- | --- |
| `track-from-design` | Size an approved design and carry it through the complete path below |
| `track-enrich` | Fill gaps using the team's template and known source facts |
| `track-validate` | Check template, hierarchy and source/AC coverage; repair supported issues |
| `track-decompose` | Derive correctly parented features or deliverable stories |
| `track-split` | Split an oversized story while preserving its criteria and source |
| `track-breakdown` | Produce an implementation plan and atomic, verifiable tasks |
| `track-amend` | Apply agreed corrections across affected items, plans and tasks |

The full path is size → enrich → validate → decompose or split as needed → break down → publish. Entry points can also run independently. A small deliverable can begin from one approved design; the workflow does not require a Vision Doc, PRD, UI specification and ADR for every change.

All entry points share one protocol. Read project settings and the relevant knowledge, item tree and artifacts; reuse accepted facts and completed sections; ask only about material gaps. Use the project's supplied template or an accepted example. Prepare a reviewable change set and a requirement-to-story-to-task coverage report under `artifactsPath`. Existing authorization is sufficient when it covers the proposed writes. Use `project-operations` for every tracker action. Read back the results and save their refs before reporting completion.

On resume, read saved refs and existing children/artifacts first. Resolve uncertain writes by search and read-back before retrying. A failed connection uses the adapter's recovery and retains the draft. Missing project setup invokes `project-bootstrap` through the existing operation boundary. Missing template information or unresolved validation decisions produce a draft with a concrete next question, not another setup process.

## Current adapter and reuse boundary

`backlogTrackingAdapter` uses Agile Backlog Toolkit **0.12.1**, published commit `e7ae82c31771a0ccda22c21858eee066168de1f2`. Its `content-view` composition assembles reviewed public excerpts into the tracking skills. It never invokes the toolkit's native workflow conductors, which contain provider-specific stages. Original dependency files are unchanged.

The source selections are in `scripts/build-tracking-content.mjs`; the committed snapshot is `packages/workflows/src/tracking-content.ts`. Each selection names its source file, contributing skill and full normalized file digest. The snapshot supplies sizing, requirement coverage, enrichment, split patterns, atomic-task and amendment guidance, including the upstream MIT license. The team's template and project language take precedence over upstream defaults. Apply a deterministic checker only when its actual input contract fits; report incompatible fixed-template checks separately rather than claiming they passed. The framework's source coverage, parent links and publication results remain required checks.

The templates contain no dependency or provider names. Rendering inserts only reviewed excerpts and the shared tracking protocol. Missing content or a missing protocol placeholder fails assembly with recovery instructions.

## Pinning and upgrading

The manifest declares the exact supported toolkit version. The existing plugin reader includes every consumed public source and the license in its checksum, including files outside skill folders. Pins also retain the underlying plugin identity and each reviewed public file digest. Expanding the reviewed file set does not pretend the release changed; changing any previously pinned source under the same version is still rejected. Removed selections retain their pinned source evidence for that release. `upgrade-check` rejects changed source digests until the content view is rebuilt and reviewed; merely re-pinning a new checksum cannot accept changed guidance.

From a built checkout, inspect or adopt the reviewed published toolkit:

```sh
pnpm agent-plugin upgrade-check project-tracking \
  --framework plugins/unified-plugin-framework \
  --plugin-root <published-toolkit-root>
pnpm agent-plugin adapter-check project-tracking \
  --framework plugins/unified-plugin-framework \
  --plugin-root <published-toolkit-root> --project <project-directory>
```

For an intentional upgrade, review the published release and update selections if necessary, then run `node scripts/build-tracking-content.mjs <published-toolkit-root>`. Missing or ambiguous boundaries and provider-specific instructions fail extraction without replacing the committed snapshot. Build the workflow package, run focused content/adapter checks, update the exact manifest version, re-pin with the command above, rebuild payloads and update their documented digests. Follow the normal review and approval process before publishing.

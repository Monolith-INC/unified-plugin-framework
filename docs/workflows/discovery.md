# Discovery workflow

Shape an idea, a proposal or an existing plan into a design the user approves, at the level of rigor the work needs. The design follows [ADR-001](../adr/ADR-001-workflow-adapter-interface.md).

## Contract v1

What users and agents rely on. It changes only by a deliberate contract version bump.

| Operation | Framework skill | When |
| --- | --- | --- |
| `discover-quick` | `skills/discover-quick` | A clear request, a small change or a first pass: one focused conversation |
| `discover-thorough` | `skills/discover-thorough` | The result must hold up: decisions are probed, the idea pressure-tested and the design reviewed |
| `discover-comprehensive` | `skills/discover-comprehensive` | Large, costly or hard-to-reverse work: several perspectives, a customer-side test, a reviewed design and formal documents |
| `discover-research` | `skills/discover-research` | The design depends on facts the user does not have yet: each decision rests on cited evidence |

Every mode also offers, once at the start, the optional skills of the catalog that it does not already use. The skills in `plugins/unified-plugin-framework` are templates: they hold the contract and name no plugin or plugin skill. The contract type is `DiscoveryOperation` in `packages/workflows/src/discovery.ts`.

## Current adapter

`brainstormingDiscoveryAdapter` uses composition `lead-and-layers`. Superpowers' `brainstorming` flow leads every session, from the first question to the written design. BMad Method adds elicitation, hardening and verification skills at set stages of it:

| Operation | During the conversation | Before the written design | On the written design |
| --- | --- | --- | --- |
| `discover-quick` | — | — | — |
| `discover-thorough` | `bmad-advanced-elicitation` | `bmad-forge-idea` | `bmad-review` (adversarial and edge-case lenses) |
| `discover-comprehensive` | `bmad-advanced-elicitation`, `bmad-party-mode` | `bmad-forge-idea`, `bmad-prfaq` | `bmad-review`, `bmad-product-brief` or `bmad-prd` |
| `discover-research` | `bmad-deep-recon` | — | `bmad-review` (verification-gaps lens) |

The catalog adds `bmad-brainstorming`, `bmad-spec` and `bmad-ux` to these. BMad Method installs its skills without a plugin prefix, so the adapter lists it in `bareSkillPlugins` and the skills name them bare. The framework declares `superpowers` `^7.0.0` and `bmad-method` `^6.12.0`; the lock pins `7.0.0` and `6.12.0`.

## Readiness and recovery

Both plugins are required, including for the catalog: readiness is never partial. The steps and recoveries are those of every workflow (see the [code review workflow](code-review.md#readiness-and-recovery)): declared, installed inside the declared range and matching the lock, every mapped and catalog skill present, and the project knowledge store configured.

## Pinning and upgrading

Superpowers is read as a Claude Code plugin: its name and version come from `.claude-plugin/plugin.json`. BMad Method is read as a folder of skills with no manifest: name it on the command line, and its version is the declared range's starting version. For both, the checksum covers the manifest, if any, and every `SKILL.md`, with line endings normalised.

```sh
pnpm --filter @agent-plugins/cli exec agent-plugin upgrade-check discovery \
  --framework plugins/unified-plugin-framework \
  --plugin-root <superpowers-plugin> \
  --plugin-root bmad-method=<bmad-method-checkout>
```

`adapter-check discovery` takes the same `--plugin-root` values, plus `--project`.

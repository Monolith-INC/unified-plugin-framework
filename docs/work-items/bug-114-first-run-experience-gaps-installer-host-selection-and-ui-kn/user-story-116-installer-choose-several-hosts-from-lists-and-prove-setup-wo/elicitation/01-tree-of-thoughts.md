# Tree of Thoughts: how to set up several hosts

## Paths

| Path | Shape | For | Against |
|---|---|---|---|
| A. Loop the lifecycle per host | `tooling-command` runs `bootstrapTooling` once per host with `{...input, host}` and folds the reports | No change to the step model, `tooling-node` or `tooling-host`; each host's verification stays as it is | Host-neutral steps (settings, CLI, runtime, knowledge, review, tracker) are inspected once per host |
| B. Per-host steps in the model | `TOOLING_STEPS` gains host-keyed steps (`skills:codex`, `skills:claude`) | Each step runs exactly once | Touches the shared `@agent-plugins/project` lifecycle, its step parser and every consumer; much more code |
| C. Installer spawns bootstrap per host | `install-release.mjs` calls `project bootstrap` N times with one-host plans | No CLI change | Plan file stops matching what the user accepted; automation via `--input` would not get several hosts; reports merged in a script |

## Evaluation

- Isolation check (source): per-host writes already go to separate places. Framework payloads use `HOSTS[host].frameworkDir`, bare skills use `HOSTS[host].bareSkills`, dependency wrappers write `HOSTS[host].manifest` beside one shared staged source, and server registration is per host. Looping does not make hosts overwrite each other.
- Cost of A: on the second host, host-neutral steps are already `ready`, so they are only inspected. The inspections are local reads, except `tracker` (one scoped read) and `knowledge-server` (per host anyway).
- Catch: `inspect("dependencies")` checks only host-neutral staging markers, so on the second host it reads `ready` without activating dependencies for that host. `host-discovery` then finds the missing skills and its configure step activates framework and dependency plugins for that host, so the run still converges. A test with two hosts must cover this path.
- C breaks Scenario 4 (automation with several hosts) unless duplicated in the CLI, so it is rejected.

## Selection

Keep **A**, with two refinements:

1. Run host-neutral steps once, in the first host's pass, and pass only host-specific steps (`skills`, `dependencies`, `knowledge-server`, `host-discovery`) for later hosts. `bootstrapTooling` already takes a `requiredSteps` list, so this is a filter, not new machinery. It removes the duplicate tracker read.
2. `packages/cli/scripts/check-distribution.mjs` also reads the plan's `host`; add it to the Code Map and tasks so release checks accept `hosts`.

## Proposed changes to the approach

- Code Map: add `packages/cli/scripts/check-distribution.mjs` (reads plan `host`).
- Task for `tooling-command.ts`: first host runs all steps; later hosts run `HOST_STEPS = skills, dependencies, knowledge-server, host-discovery` only.
- Design Notes: replace the "one extra read each" sentence with the isolation evidence above.

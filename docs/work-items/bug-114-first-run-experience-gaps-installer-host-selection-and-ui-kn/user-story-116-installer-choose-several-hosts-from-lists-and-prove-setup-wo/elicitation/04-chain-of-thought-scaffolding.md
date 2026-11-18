# Chain-of-Thought Scaffolding: does the per-host loop actually meet each criterion?

Each conclusion below is reached through explicit premises checked against the source.

## C1. "Running the lifecycle per host sets up each host" (Scenario 1)

1. `bootstrapTooling(io, apply, requiredSteps)` runs `TOOLING_STEPS.filter(step => requiredSteps.includes(step))` in order (`packages/project/src/tooling.ts`).
2. A step that cannot be inspected or configured becomes `action-required` and the run **continues**; only an unexpected failure stops it.
3. `nodeToolingIO(project, input, env)` reads `input.host` for `skills`, `dependencies`, `knowledge-server` and `host-discovery`, and nothing else is host-specific (`configureReview` writes one host-neutral file).
4. So `bootstrapTooling(nodeToolingIO(project, {...input, host: h}, env), apply, steps)` sets up host `h`.

**Correction:** the plan already carries `steps` chosen by the user (`input.steps`). Later hosts must run `HOST_STEPS ∩ input.steps`, not `HOST_STEPS` alone, or a plan that skipped dependencies would run them anyway.

## C2. "Types stay honest"

1. Every per-host function takes a `BootstrapInput` with one `host`.
2. If `BootstrapInput` gains `hosts` and keeps `host`, each caller must choose one, and nothing stops a per-host function reading the wrong one.
3. So split the types: `parseBootstrap` returns an **`AcceptedPlan`** with `hosts`; a pure `forHost(plan, host): BootstrapInput` builds the per-host view. Per-host code is unchanged and cannot see `hosts`.

## C3. "One failed host does not hide another" (matrix row "Several hosts")

1. With the loop, each host gets its own `ToolingReport`.
2. The combined status is `ready` only when every host's is (the `all-ready` monoid: `concat = both ready`, `empty = ready`).
3. A host whose CLI is missing (for example `claude` not installed) fails `host-discovery`, which is not a follow-up, so the installer exits 1 — and the report must name **that host** in the "Setup did not finish" list.

**Addition:** the report module prefixes each open step with its host (`claude / host-discovery: …`), except for host-neutral steps, which are listed once.

## C4. "The original request resumes only when everything is ready"

1. `resumeTooling(report, resume)` resumes only when `report.status === "ready"`.
2. Passing the **combined** report keeps that rule for several hosts, and the request resumes once, not once per host.

## Proposed changes to the approach

- `tooling-input.ts` task: `parseBootstrap` returns `AcceptedPlan` (`hosts`); add pure `forHost(plan, host): BootstrapInput`.
- `tooling-command.ts` task: later hosts run `HOST_STEPS ∩ plan.steps`; resume once from the combined report.
- `install-report.mjs` task: open steps are labelled with their host; host-neutral steps listed once.
- Add an `all-ready` law test (associativity and identity) per the repository's monoid rule.

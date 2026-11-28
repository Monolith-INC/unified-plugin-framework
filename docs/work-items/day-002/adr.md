# ADR — Verified UPF Discovery and choice delivery

## Context and decision

The Daybook DAY-002 refinement exposed Discovery routing and completion gaps in UPF. Deliver the recovered UPF fixes from the v0.6.0 baseline. Keep the original Daybook feature, team template lookup, and unrelated installer work outside this delivery. The unsupported-provider review setup fix already shipped through PR #47.

### FR-001

When an installed UPF workflow calls the CLI, the workflow shall use the project launcher path so the call works without a global agent-plugin executable.

### FR-002

Before requesting design approval, Discovery shall present the design or an accessible reference and identify the revision being reviewed.

### FR-003

When the user selects Forge Idea or a review lens, Discovery shall record its observed outcome or specific recovery before claiming completion.

### FR-004

When proceeding from Quick Discovery or resuming, the workflow shall preserve its required lead path, selected optional work, and approval state.

### FR-005

When diagnosing which skill ran, UPF shall distinguish a selected cached skill from the corresponding project-installed skill and report the evidence available for each.

### FR-006

When an optional multiple-choice prompt uses numbered text, the workflow shall accept an explicit none response without treating it as an unanswered prompt.

### FR-007

When a user opens the README shipped in the release archive, its local documentation links shall resolve inside that archive.

## Evidence and gates

Review the recovered implementation independently before the live Codex desktop choice test. After that desktop test passes, verify a fresh installation. Keep the reported 0.5.1 tests and simulated tool responses as historical evidence.

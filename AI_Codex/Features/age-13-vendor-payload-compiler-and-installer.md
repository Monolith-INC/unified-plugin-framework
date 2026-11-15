---
type: feature
id: AGE-13
title: Vendor Payload Compiler and Transactional Installer
status: planned
milestone: M4 — Vendor Payload Compiler & Transactional Installer
target: 2026-09-25
linear: https://linear.app/agentical-monolithics/issue/AGE-13/deliver-vendor-payload-compiler-and-transactional-one-command
---

# AGE-13 — Vendor Payload Compiler and Transactional Installer

## Outcome

Extend the portable toolkit with required Claude, Cursor, and Codex adapters. Each adapter owns its vendor schemas, deterministic transformation logic, payload validation, installation-plan rules, and shipped prebuilt payload. Users install one selected payload through one transactional `agent-plugin install` operation.

Compilation is a release-time responsibility. Installation never compiles, wires, generates after installation, selects an alternate delivery mechanism, or enters a second activation workflow.

## Specs

- Accepted: [[Specs/age-13/design-doc]]
- Accepted: [[Specs/age-13/tech-spec]]
- Accepted: [[Specs/age-13/api-contract]]
- Accepted: [[Specs/age-13/implementation-plan]]

## Linear Breakdown

| Ticket | Deliverable | Due |
| --- | --- | --- |
| [AGE-14](https://linear.app/agentical-monolithics/issue/AGE-14/define-canonical-source-vendor-bundle-and-installation-contracts) | Canonical source, bundle, and installation contracts | 2026-08-14 |
| [AGE-15](https://linear.app/agentical-monolithics/issue/AGE-15/implement-vendor-adapter-sdk-and-shared-conformance-harness) | Adapter SDK and conformance harness | 2026-08-21 |
| [AGE-16](https://linear.app/agentical-monolithics/issue/AGE-16/implement-deterministic-compiler-and-shipped-payload-pipeline) | Deterministic compiler and shipped-payload pipeline | 2026-08-28 |
| [AGE-17](https://linear.app/agentical-monolithics/issue/AGE-17/implement-cursor-adapter-and-ship-its-generated-payload) | Cursor adapter and payload | 2026-09-04 |
| [AGE-18](https://linear.app/agentical-monolithics/issue/AGE-18/implement-claude-adapter-and-ship-its-generated-payload) | Claude adapter and payload | 2026-09-04 |
| [AGE-19](https://linear.app/agentical-monolithics/issue/AGE-19/implement-codex-adapter-and-ship-its-generated-payload) | Codex adapter and payload | 2026-09-11 |
| [AGE-20](https://linear.app/agentical-monolithics/issue/AGE-20/implement-transactional-vendor-payload-installer) | Common transactional installer | 2026-09-11 |
| [AGE-21](https://linear.app/agentical-monolithics/issue/AGE-21/expose-the-single-transactional-install-command) | Single install command | 2026-09-18 |
| [AGE-22](https://linear.app/agentical-monolithics/issue/AGE-22/verify-payload-conformance-drift-security-and-rollback-end-to-end) | End-to-end conformance, security, drift, and rollback | 2026-09-23 |
| [AGE-23](https://linear.app/agentical-monolithics/issue/AGE-23/document-and-release-the-vendor-payload-installation-architecture) | Documentation and release | 2026-09-25 |

## Architectural Invariants

1. Canonical plugin content has exactly one authored source.
2. Claude, Cursor, and Codex are the complete vendor set for M4.
3. Each vendor has exactly one registered adapter.
4. Each adapter produces and ships exactly one complete payload for a plugin version.
5. Generated payloads are reproducible and never edited directly.
6. `agent-plugin install` is the only installation operation.
7. Every vendor uses the same transaction engine.
8. Failure restores the exact pre-install target state.
9. `@agent-plugins/core` remains portable and vendor-neutral.
10. No install-time compilation, wire command, dynamic artifact service, post-install generation, fallback adapter, or alternate delivery workflow exists.

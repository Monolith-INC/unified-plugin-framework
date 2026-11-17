# Complete tooling bootstrap

Date: 2026-11-17
Ticket: [AGE-101](https://linear.app/agentical-monolithics/issue/AGE-101/complete-tooling-bootstrap-and-verified-project-setup)
Status: Product implementation approved in chat; in progress on `feature/AGE-101-tooling-bootstrap`.

## Outcome

Bootstrap the supported tooling together, beginning with this repository. A user accepts one concrete setup plan, the missing tools are configured, and the original request resumes. Later calls use working capabilities directly. Missing capabilities return to the affected setup step; individual skills do not run recurring setup interviews.

Project setup includes the selected tracker and project, communication/document language, document locations, usable framework CLI and host skills, required pinned workflow dependencies, one shared knowledge store, its isolated runtime and host retrieval registration, and review integration with that same store. Existing valid settings, unrelated tools, original dependency files and completed setup steps are preserved.

## Existing pieces and gaps

- AGE-100 supplies settings, neutral requests, adapter construction and resume-once behavior. It deliberately does not install missing executables or plugins.
- AGE-90 supplies standalone knowledge setup/discovery skills and the Python runtime. Runtime installation, host registration and skill delivery are separate; the knowledge plugin currently has no shipped host payload.
- AGE-98 supplies tracking, reviewed content views, pins and reference evidence. Dependency availability still needs host installation.
- The source checkout provides a usable CLI through pnpm after build; a skill payload alone supplies no executable or Node dependencies.
- A connected tracker tool and the standalone adapter have different authentication contexts. Setup must test the selected execution path, preserve an authentication failure and offer its supported recovery; it must not declare success because another client is authenticated.

## Implementation approach

Extend the existing project bootstrap entry point and installer boundaries. Keep a pure setup plan separate from accepted filesystem, process, host-registration and connection effects. Reuse existing installers and the operation service; avoid another workflow engine, dependency resolver or tracker implementation.

1. Inspect only capabilities needed by the requested workflow, or the full supported set when explicitly bootstrapping. Read existing choices and supported host configuration before proposing changes.
2. Present one plan: accepted settings, tools reused, missing installations/registrations, local runtime/cache locations and any user authentication required. Reuse authorization for those exact changes. Store references to credentials, never secrets in project files or logs.
3. Use existing host compilation/installation for framework and knowledge skills. Supply the CLI and isolated knowledge runtime through the supported installation source. Configure pinned workflow dependencies through their supported host surface, preserving original source and versions.
4. Create or reuse the shared knowledge store through its existing discovery procedure. Source facts and authored rules; retain provenance and open questions. Connect review settings and host retrieval to that root.
5. Verify concrete operations: executable runs; host sees installed skills; runtime initializes and catalog → find → fetch returns a real unit; the selected project adapter reads an existing scoped item. Report blocked capabilities separately from completed ones.
6. Resume the saved operation once. On another run, reuse successful steps and resolve only the missing capability. Resolve uncertain writes before retrying. Host-specific details stay in host adapters; provider details stay in project adapters.

Start with the selected Codex host in this repository. Describe and verify each additional host's actual support before claiming its setup complete. A required session reload is a remaining activation step, not proof of discovery. Keep one implementation card and one branch; apply the repository's efficient review/check policy.

## Accepted repository setup

The owner accepted the existing Unified Plugin Framework Linear project, English, `docs/` for documents and vault originals, `.project-knowledge/knowledge` as a local shared optimized store, an isolated Python runtime, and Codex integration. Local runtime/cache/configuration stays out of commits. Existing local FP hook settings are preserved.

The first setup establishes source-backed knowledge, installs its runtime in an isolated environment, connects review settings, registers a project-scoped knowledge server, and records direct verification. Missing standalone tracker credentials are reported without requesting secrets in chat.

## Repository setup evidence

- Saved the accepted tracker, project, language and document settings through the existing project service. Connected review configuration to the same knowledge root and current connected-tool bindings.
- Created nine indexed knowledge units with source/provenance metadata. Installed the knowledge runtime in an isolated environment and verified catalog, search and fetch over its real protocol. Codex lists the project-scoped server as enabled; current chat activation still depends on a session reload.
- Installed the verified framework payload and activated it through Codex's supported plugin mechanism using a local marketplace. A fresh app-server discovery lists all sixteen namespaced framework skills and the two knowledge skills, with no discovery errors. This establishes discovery, not every workflow's execution.
- The local executable runs the existing CLI. A standalone read returned the explicit `authentication-needed` recovery because its credential is absent. Connected Linear reads remain available separately; their login is not silently copied into the standalone adapter.
- Pinned workflow sources were staged through the new setup path without changing their originals. Host activation is verified separately, including the adapter's bare-skill convention.
- The owner explicitly authorized removal of the sixteen duplicate setup-created skill links, and they were removed. Existing FP hook settings are preserved.

Local runtime, cache, settings and knowledge data are excluded from commits. Product setup now uses the shared capability lifecycle, host adapter registration, existing transactional payload installer and project operation service. A populated knowledge store and review provider bindings remain agent-guided steps with explicit recovery; setup does not fabricate project facts or provider configuration.

## Review and verification

The single correctness/maintainability pass identified accepted settings being skipped, insufficient review-binding validation, an ancestor-link write escape, unverified active bare-skill content, marketplace replacement and interrupted dependency staging. One fix round now compares accepted settings through the existing refinement, guards review paths and requires provider bindings, verifies discovered skill content against exact-pinned staged sources, preserves catalog entries and metadata, and stages dependency copies privately before atomic publication. Focused regressions cover those failure paths.

The installed runtime's protocol check verifies a real indexed unit through catalog, search and fetch. Fresh Codex discovery also verifies the active dependency content rather than relying on names or ownership markers. The live repository setup succeeds for these capabilities; the standalone tracker credential remains absent and reports its existing authentication recovery. Connected tracker access is separate and its credentials are never copied.

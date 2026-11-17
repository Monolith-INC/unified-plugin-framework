# Complete release distribution implementation plan

> Execution: implement in this session using the existing shared bootstrap and installer. Owner explicitly approved implementation on 2026-11-17.

**Goal:** Ship one installable release containing all five pinned workflow plugins, the working CLI and its production dependencies, framework/knowledge sources and lock, runtime source, supporting files and licenses. No consumer plugin repository downloads or development checkout.

**Architecture:** A release build fetches and verifies upstream pins through existing dependency-source and binding capabilities. It deploys the existing CLI with pnpm's production deployment while preserving `packages/cli/dist` relative layout, copies canonical sources and runtime, and archives the resulting distribution. A distribution manifest identifies local dependency roots. Bootstrap selects these included sources and runs the same validation/staging flow; missing or mismatched bundled sources fail without network fallback. A small release installer downloads just this archive/checksums (or accepts a local archive), installs an owned versioned distribution, then invokes existing bootstrap with the user's accepted plan. No new resolver or parallel host installer.

**Scope:** All dependency trees stay unchanged. Runtime language/package prerequisites may still be installed by existing runtime setup; this is not an offline OS/runtime installer. Complete automated setup retains current Codex/Linux support; macOS qualification remains deferred. Claude/Cursor host payloads remain available without claiming complete automation. Publication and a real-project host trial follow user review of the completed implementation.

## Global constraints

- Preserve unrelated settings, original dependency trees and unmanaged target paths.
- Keep release asset generation's current per-host payloads; add complete distribution, installer and checksums.
- New TypeScript uses immutable inputs, explicit results, pure source selection and named effect boundaries; reuse existing lock and installer checks.
- Do not run duplicate reviews: one thermos pass, plus requirements review only on an open PR and posting only after confirmation.

## Task 1: Included dependency resolution

Files: `packages/cli/src/distribution.ts`, `tooling-host.ts`; `packages/cli/test/distribution.test.mjs`.

- [x] Test selection of all pinned local roots, explicit roots, absent/corrupt distribution metadata and missing/drifted bundled content.
- [x] Add a typed manifest parser/local-source selector. Existing source checkouts keep their development fetching flow. A distribution must resolve all selected dependencies locally and verify through the current pin gate, with no fetching fallback.
- [x] Reuse shared bootstrap staging and verify focused regressions.

## Task 2: Complete build and installer

Files: `packages/cli/scripts/release-distribution.mjs`, `scripts/install-release.sh`, `package.json`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`; artifact integration test/script.

- [x] Build the production CLI via `pnpm deploy --legacy --prod`, including Node dependencies. Copy framework/knowledge sources, runtime source and licenses. Fetch all five sources at build time using existing capabilities; verify before archiving.
- [x] Record exact included versions, source locations and file digests. Generate archive/installer SHA-256 entries alongside existing assets; reject incomplete builds before publication.
- [x] Provide one installer with version, project, accepted plan and local archive modes. Verify checksum and archive safety, preserve unmanaged paths and install into an owned versioned location. Invoke existing bootstrap from that location.
- [x] Verify an extracted artifact relocated outside the checkout: CLI runs, payloads install, all five dependencies stage using local sources, no git/plugin network call occurs, re-entry succeeds and drift is refused.

## Task 3: Delivery integration and verification

Files: README, installation/bootstrap guides, CHANGELOG and this plan.

- [x] Document one-command installation, bundle contents, user-selected plan, runtime prerequisites, platform limits and development-only fetching.
- [x] CI builds and smoke-tests complete archive before release publication. Asset attestations cover the new archive and installer.
- [x] Run one thermos review and fix actionable findings once. Run required install/build/typecheck/test/payload/hook checks once in a clean clone of final changes before push approval.
- [x] Report local evidence and remaining real-host trial/publication steps accurately.

## Review focus

1. Bundled dependency is missing or differs from its pin: explicit failure, no network recovery.
2. Moved archive: CLI, workspace dependencies and data roots remain valid.
3. Existing unmanaged/symlink target: preserve it, refuse unsafe writes.
4. Corrupt archive or checksum: refuse before extracting or activating.
5. Licenses and referenced support files: include upstream trees, preserve their contents.

## Verification evidence (2026-11-17)

Implementation commit: `4210516` on `feature/AGE-107-complete-release` (subsequent documentation-only evidence update).

A clean clone of that commit passed `pnpm install --frozen-lockfile`, build, typecheck, test, payload verification, Claude hook tests and Codex hook tests. Python 3.12 isolated checks passed 22 owned/installed-wheel tests and 60 inherited tests. That clone also built all host assets and the complete `0.2.1-rc.1` archive and passed the artifact-only installation script outside the checkout. All eleven release files matched SHA256SUMS. The knowledge runtime was also installed from the extracted distribution into an isolated environment and imported successfully as version 0.1.1.

Artifact verification exercised the real installer, running CLI, both framework/knowledge payloads, staging all five bundled dependencies with fetching denied, repeat installation, relocation/owned CLI replacement, preserved error output and refusal of source/staged drift or missing metadata. The archive is approximately 7.1 MiB. This local version label is a test build, not a published release.

One thermos pass identified cross-filesystem publication and repeated whole-tree hashing in unrelated setup steps. Publication now uses a temporary sibling of the final directory; inventory checks run at dependency boundaries while path resolution stays independent. Installer setup-error stdout is preserved. Focused regressions and the final artifact check passed after the fixes. No review findings remain deferred.

The two pre-existing local hook configuration edits were excluded from the implementation commit. No push, PR, release publication or real-project host trial has occurred. Requirements review on an open PR and a real-project Codex trial remain subsequent delivery steps; macOS remains deferred by owner decision.

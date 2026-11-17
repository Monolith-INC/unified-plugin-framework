# One-command interactive installation

Owner approved the correction with “proceed”: follow Codex Workflows Plugin's one-command installer pattern. Keep the README rewrite on this branch, but replace its rejected plan-file-first setup instructions.

## Outcome and constraints

Run `bash <(curl -fsSL …/releases/latest/download/install.sh)` from the consuming project. The launcher fetches the release installer and preserves the terminal. The installer resolves a release, downloads/verifies the complete bundled archive, asks for missing setup choices with defaults, shows the concrete changes and asks once before changing the project. It creates its plan internally, reuses the existing bootstrap, verifies readiness and reports follow-up actions. Explicit `--input` remains the automation path, without prompts. No unsupported provider/host, uninstall or package-manager replacement is added.

The supported automated host remains Codex/Linux. Reuse existing language, tracker, document and knowledge choices. Never collect credential values into plans/logs. New Linear configuration selects names through the existing MCP connector and records returned UUIDs; unavailable credentials are an explicit recovery, not an invented connection. Local tracker verification must work on an empty project through a read-only search, not require a fabricated ticket. Knowledge content and provider bindings remain agent-guided steps, reported accurately rather than generated or marked ready.

## Implementation

1. `scripts/install.sh`: minimal curl/Node release launcher, current-directory behavior, version pinning through `UPF_VERSION`, cleanup, argument forwarding; no installer logic duplicated.
2. `scripts/install-release.mjs`: preserve checksum/archive/link checks and owned distribution publication; support latest version and interactive default, `--project`/`--dest`, `--help`, and existing `--input`/local archive flags. Download/extract privately before questions. Only after confirmation copy into a private sibling on the target filesystem and atomically publish. Preserve cancellation and structured verification errors.
3. `packages/cli/scripts/installer-wizard.mjs`: exported collection procedure with injected question/output capabilities, immutable answers and validation through existing project/bootstrap parsers. Read existing settings; ask only missing choices; show defaults and selected changes; persist an internal plan safely for re-entry. Keep terminal IO at a named boundary and never edit dependency source.
4. `packages/project/src/node.ts`: reuse one MCP connection boundary for existing tracker operations and setup discovery. Provide a small typed, read-only Linear scope lookup by names; handle ambiguous/unavailable results without saving settings.
5. `packages/cli/src/tooling-node.ts`: use the existing project-operation service for a read-only scoped search when no trackerRef is supplied. Preserve get-by-ref verification where supplied.
6. Release packaging includes/checksums the shell launcher and packaged wizard; artifact tests exercise the same public entry points. README leads with one interactive command, then optional automation and accurate readiness limits. Update detailed installation/setup guides and changelog.

## Verification tasks

- [ ] Unit tests: first install/defaults, saved settings, invalid input, cancellation, absent TTY, explicit automation, Linear scope selection failure, and no credential persistence.
- [ ] Launcher tests: argument forwarding, version pinning, nonzero errors and no prerequisite JSON file.
- [ ] Empty local tracker read-only readiness check; no test ticket created.
- [ ] Artifact checks: complete distribution still installs/re-enters and refuses checksum/content drift; actual terminal wizard reaches confirmation and runs shared bootstrap.
- [ ] One thermos pass, one fix round; full required checks once in a clean clone of final code before push.
- [ ] Report changed README/installer, actual verification and remaining host/model/provider limits without claiming a new public command exists in v0.2.1.

## Deliberate choices

The shell launcher uses curl for public release downloads; the installer uses Node's HTTPS fetch with a bounded timeout, removing GitHub CLI as a general installation prerequisite. GitHub CLI can still be required by a user's chosen SCM tooling. Python package dependencies continue through the existing isolated runtime installer. An incomplete full setup remains visibly incomplete even when plugin files were successfully installed.

## Review and focused evidence

One correctness/security and maintainability pass found partial Linear scope reuse, overwritten saved Python defaults, extraction requiring a specifically named Python executable before the wizard, and tracker readiness depending on kind labels of unrelated issues. The implementation now validates/reuses complete tracker settings and resolves only missing scope, retains saved Python defaults, discovers a usable Python 3.12+ executable before extraction, and probes tracker connectivity without weakening normal work-item decoding. Regression tests cover these cases.

The artifact-only check passed for the complete local `0.2.2-rc.1` test build. A real pseudo-terminal accepted the generated plan in an isolated Codex profile and verified eight capabilities: settings, CLI, both host payloads, all five dependencies, isolated knowledge runtime, knowledge settings, fresh Codex discovery and an empty local tracker read. Missing authored knowledge and review-provider bindings remained explicit follow-up actions with a nonzero incomplete-setup result. This is local evidence, not a published release or a model-driven workflow trial.

The owner explicitly requires tests with type checking disabled because type-enabled tests crash their machine. Tests run directly as JavaScript with concurrency 1; any necessary TypeScript emission uses `--noCheck`. Do not invoke package test scripts that include type checking. Final verification records this deliberate exception to the usual repository commands.

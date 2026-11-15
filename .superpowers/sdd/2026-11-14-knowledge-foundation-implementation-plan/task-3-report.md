# Task 3 report: standalone launcher and protocol checks

## Changes

- Added `upf_knowledge.launcher:main` as the console entry point. It accepts `--project`, `--root`, and `--check`; resolves relative roots from the project; validates the owned and legacy configuration shapes; delegates pure selection to `select_store`; and refuses missing, conflicting, invalid, unreadable, and unsupported-platform cases with structured JSON errors and status 2.
- The launcher checks the platform before importing the packaged vendor modules. Normal server startup delegates to the original MCP server with the selected root. The server keeps protocol traffic on stdout.
- Added launcher tests covering the required error codes, no-store-creation behavior, project-relative roots, spaces in paths, and successful checks.
- Added an installed-wheel stdio protocol test covering the exact seven-tool surface, a `new` creation, competing writes with one stale token, truncation, and assumed provenance.
- Updated runtime usage documentation and excluded generated build artifacts through the runtime `.gitignore`.

## Verification

- Focused runtime suite: `16 tests passed` using `/tmp/upf-knowledge-validation/bin/python -m unittest discover -s runtimes/project-knowledge/tests -v`.
- Inherited upstream store and MCP tests: `60 tests passed`, using unchanged original test files with the two runtime modules copied from the installed wheel into a temporary test fixture.
- The protocol test builds a wheel from a temporary copy of the runtime, installs it in `/tmp/upf-knowledge-validation`, and launches its executable outside the checkout.

The protocol test initially timed out in the restricted subprocess environment. A bounded run with subprocess launching enabled passed, so the observed hang was environmental rather than an inherited protocol failure. The test currently expects the prepared `/tmp/upf-knowledge-validation` virtual environment; CI should provide or adapt that environment before running the full suite.

## Scope

Vendored source files were not edited. No pnpm checks were run; those remain with the release gate.

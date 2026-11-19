---
type: verification-plan
story: AGE-133
status: active
---

# Verification plan: Claude payloads pass Claude Code's official validator

## How the work will be proven

Each acceptance criterion is proven by an automated check that runs on every change, and where it involves Claude Code itself, by running Claude Code's own checker, `claude plugin validate`, on real payloads. Local checks run as plain JavaScript with type checking switched off, because type checking the whole workspace exhausts this machine's memory. Type checking runs once, through a build of the command-line package, which covers every package that reads the plugin manifest. The CI build on the pull request runs everything again with type checking on, on Linux, Windows and macOS.

## Proof for each acceptance criterion

| Acceptance criterion | Automated proof | Checker proof |
|---|---|---|
| Every shipped payload passes the strict checker | Claude payload verification builds each shipped plugin twice, compares the results, then runs the checker with `--strict` on each | All three shipped payloads report "Validation passed" with no warnings |
| A payload built before this change fails the strict checker | Not automated: the old payload exists only on a machine where an earlier version is installed | The checker with `--strict` exits with status 1 on an installed earlier payload that has no author |
| A bundle naming the default folders still passes; one naming another folder fails | The adapter test rebuilds a bundle with the old default entries and expects no problems, then with `./elsewhere/` and expects one `claude.manifest.component` problem | Not needed |
| A new or older marketplace gets a description; the user's own is kept | The marketplace test merges a new catalog, an older catalog without a description, and one with the user's description | Not needed |
| CI passes on Linux, Windows and macOS | The pull request's CI build installs Claude Code 2.1.318 and runs payload verification on each machine | Each machine's log shows the checker passing for all three payloads |

## Checks that guard the edges

- **Malformed author or licence:** the manifest test feeds a string author, an empty name, a non-string email and an extra key, and a non-string licence, and expects one named problem each.
- **Checker missing:** payload verification run with `CLAUDE_CODE_CLI` pointing at a program that does not exist fails, and its message says to install Claude Code or set that variable.
- **Functional rules:** the project's functional-programming checker runs on every changed source file and reports nothing.

## Commands

- `node ~/.claude/scripts/suite-without-types.mjs .` passes every test and every payload verification.
- `pnpm --filter @agent-plugins/cli build` passes, type-checking every package that reads the manifest.
- `claude plugin validate --strict <earlier payload>` exits with status 1.

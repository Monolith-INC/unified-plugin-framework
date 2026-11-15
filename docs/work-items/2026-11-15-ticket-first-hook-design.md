# Ticket-branch hook

Status: approved 2026-11-15

## Rules enforced

1. Work only on a ticket branch: `feature/<KEY>-<n>-<slug>`.
2. The branch was cut from `main`.

## How

A Claude Code hook, `.claude/hooks/require-ticket-branch.sh`, runs before file edits and before any command containing `git commit`. It checks the branch of the project checkout. It stops the action if the branch name is not a ticket branch, or if the branch was created from a commit that is not on `main` (read from the branch's reflog).

## Kept simple on purpose

The hook does not try to catch every way around it, such as unusual command spellings, other worktrees or other tools. GitHub branch protection on `main` stops anything it misses from reaching `main`.

## Tests

`bash .claude/hooks/tests/require-ticket-branch.test.sh`, also run in CI.

## Rule 3: no direct commits or pushes to main

- Commits on `main`: blocked by the same hook, because `main` is not a ticket branch.
- Pushes to `main`: GitHub branch protection on `main`, enabled 2026-11-15. It requires a pull request (no required approvals), applies to administrators, and forbids force pushes and deleting `main`. No CI check is required yet, because CI has not run on this fork.

## Rule 4: merge only through a pull request

Enforced by the same GitHub branch protection: `main` only changes through a merged pull request. A local merge into `main` cannot be pushed.

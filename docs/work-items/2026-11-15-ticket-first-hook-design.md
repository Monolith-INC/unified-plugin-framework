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

## Rule 5: review, fix, review again

The hook blocks `git push` and `gh pr create` unless the current commit passed review. After the confirming review, record it with `git config branch.<branch>.reviewed <commit>`. Any later commit needs a new review. Commands are recognised only at the start of a command (or after `;`, `&`, `|`, `(`), so text that mentions them is not blocked.

The review loop ends when a round finds no correctness or security problems in the change. After three rounds, the remaining findings go to the owner to decide.

## Rule 6: push, then squash-merge with the ticket key in the title

- Repository settings (GitHub, 2026-11-15): squash merge only; merge commits and rebase merges are off. The squash commit takes the pull request title and body.
- The hook blocks `gh pr create` unless it has `--title` containing the branch's ticket key, for example `AGE-63: <summary>`.

## Rule 7: merge under the owner's standing approval

Approval is standing by default. When the owner withdraws it in chat, the agent sets `git config workflow.mergeApproval withdrawn`, and the hook blocks `gh pr merge`. When the owner approves again, the agent sets it back to `standing`. The change is also noted on the tracker ticket.

## Rule 8: move the ticket to Done

A Claude Code PostToolUse hook, `.claude/hooks/after-merge.sh`, runs after `gh pr merge` and tells the agent to move the branch's ticket to Done in the tracker. Moving it stays a tracker action.

## Rule 9: plans and specs go in docs/work-items/

The hook blocks writing a Markdown file whose name contains `plan`, `spec` or `design` anywhere in the project except under `docs/work-items/`.

# Workflow rules enforcement

Status: approved 2026-11-15

## Rules

1. Take a tracker ticket before working.
2. Cut a branch from `main`, named `feature/<KEY>-<n>-<slug>`.
3. Never commit or push directly to `main`.
4. Merge only through a pull request.
5. Run code review, fix, then review again to confirm.
6. Push, then squash-merge with the ticket key in the title.
7. The agent merges under the owner's standing approval, which the owner can withdraw in chat.
8. Move the ticket to Done.
9. Plans and specs go in `docs/work-items/`.
10. Run the `pnpm` checks when implementation changes.

## How each rule is enforced

Two Claude Code hooks do the local checks. `.claude/hooks/require-ticket-branch.sh` runs before an action; `.claude/hooks/after-merge.sh` runs after a command. GitHub settings enforce the rest and stop anything the hooks miss.

The hooks judge the checkout the action targets: the directory of the edited file, or the command's working directory (or `git -C <dir>`). They only act inside this project's repository and its worktrees. Commands are recognised at the start of a line or after `;`, `&`, `|` or `(`, so text that only mentions them is not blocked. A detached HEAD, as during a rebase, allows edits and commits but not pushes or pull requests. Commands match as whole words, so `git commit-graph` is not a commit.

| Rule | Enforcement |
| --- | --- |
| 1 | File edits and `git commit` are blocked unless the branch is `feature/<KEY>-<n>-<slug>`. |
| 2 | Blocked when the branch's local creation point (from the reflog) is not on `origin/main`, or `main` without a remote. Branches already on `origin` are not judged. |
| 3 | Commits on `main`: rule 1. Pushes to `main`: GitHub branch protection (pull request required, administrators included, no force push or deletion). |
| 4 | GitHub branch protection. |
| 5 | `git push` and `gh pr create` are blocked until `git config branch.<branch>.reviewed` equals `HEAD`. The agent records it after the confirming review. The loop ends when a round finds no correctness or security problems; after three rounds the rest goes to the owner. |
| 6 | GitHub allows squash merge only, using the pull request title. `gh pr create` is blocked unless `--title`/`-t` starts with the branch's ticket key. |
| 7 | `gh pr merge` is blocked while `git config workflow.mergeApproval` is `withdrawn`. The agent sets it when the owner withdraws approval in chat, and back to `standing` when the owner approves again. |
| 8 | After `gh pr merge` (not `--auto`), the after-merge hook tells the agent to move the merged pull request's ticket to Done. |
| 9 | Creating a Markdown file whose path has the word plan, spec or design (as a whole part of a name) is blocked outside `docs/work-items/`. Existing files can still be edited; moving them is cleanup work. |
| 10 | When the branch changes `packages/`, `plugins/`, `fixtures/`, `package.json`, `pnpm-*.yaml` or `tsconfig*.json`, `git push` and `gh pr create` are blocked until `git config branch.<branch>.checked` equals `HEAD`. |

## Limits

- Kept simple on purpose. Unusual command spellings, file writes through shell commands, and other tools are not checked; GitHub protection on `main` is the backstop.
- The review and check records (rules 5 and 10) are set by the agent; they make the step explicit but cannot prove it happened.
- Stacked branches (cut from another feature branch) are blocked by rule 2.
- `gh pr create --fill` is blocked; pass an explicit `--title`.
- Command-text limits kept for later consideration: a `cd` earlier in the command or a quoted `-C` path is not followed; pushing a branch other than the current one is judged against the current branch; `-t` inside `--body` text can be read as the title.
- No CI check is required on `main` yet, because CI has not run on this fork.

## Tests

`bash .claude/hooks/tests/require-ticket-branch.test.sh`, also run by the `hooks` CI job.

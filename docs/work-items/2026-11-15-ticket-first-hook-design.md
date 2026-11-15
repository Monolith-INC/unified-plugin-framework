# Ticket-first hook

Ticket: AGE-63 · Status: approved 2026-11-15

## Rule

Rule 1 of the project rules: no work without a tracker ticket. A file inside the repository can only be changed, or `git commit` run, while the checkout is on a ticket branch `feature/<KEY>-<n>-<slug>`.

## Mechanism

Claude Code PreToolUse hook `.claude/hooks/require-ticket-branch.sh`, registered in `.claude/settings.json` for `Edit`, `Write`, `MultiEdit`, `NotebookEdit` and `Bash`.

- Scope: only this project's repository and its worktrees (same git common dir as `$CLAUDE_PROJECT_DIR`). Other repositories and paths outside any repository are allowed.
- File tools: the branch of the checkout containing the target file is checked.
- Bash: `git commit` is detected in the command text, including a path to the git binary, global options (`-C`, `-c`, `--git-dir`, `--work-tree`, `--no-pager`) and shell separators. Every checkout it may commit in is judged: the session's cwd, each `cd <dir>` and `git -C <dir>` (relative or `~`), and the project when its path appears.
- Pattern: `branch_template` from `.harness/settings.json` (default `feature/{key}-{slug}`), with `{key}` = `<team>-<n>` (team from `.tracker.values.team`, any uppercase key when unset) and `{slug}` = `[A-Za-z0-9._-]+`. Worktrees without `.harness/` use the project checkout's settings.
- A detached HEAD during a rebase is judged by the branch being rebased.
- Edits inside a `.git` directory of the project are judged against the project checkout.
- Blocks with exit 2 and a message naming the branch to create. Fails closed without `jq` or `git`, when git cannot read a path inside the project, when `.harness/settings.json` cannot be parsed or has an unknown placeholder, and when the hook script is missing or crashes (wrapper in `.claude/settings.json`).

## Limits

- File writes made through Bash (`sed -i`, redirection) are not checked.
- Text that merely mentions `git commit` (quoted strings, heredocs) is also blocked on a non-ticket branch.
- Claude Code only; git hooks were deliberately excluded for now.
- The ticket is not looked up in the tracker, so existence, state and order are not verified.

## Tests

`bash .claude/hooks/tests/require-ticket-branch.test.sh`, also run by the `hooks` CI job.

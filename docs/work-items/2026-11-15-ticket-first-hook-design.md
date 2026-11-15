# Ticket-first hook

Ticket: AGE-63 · Status: approved 2026-11-15

## Rule

Rule 1 of the project rules: no work without a tracker ticket. A file inside the repository can only be changed, or `git commit` run, while the checkout is on a ticket branch `feature/<KEY>-<n>-<slug>`.

## Mechanism

Claude Code PreToolUse hook `.claude/hooks/require-ticket-branch.sh`, registered in `.claude/settings.json` for `Edit`, `Write`, `MultiEdit`, `NotebookEdit` and `Bash`.

- File tools: the branch of the repository containing the target file is checked, so worktrees are judged correctly. Files outside any repository are allowed.
- Bash: only the literal `git commit` is checked, against the session's working directory.
- `<KEY>` is the tracker team from `.harness/settings.json` (`.tracker.values.team`); without it, any uppercase key is accepted.
- Blocks with exit 2 and a message naming the branch to create. Fails closed without `jq`.

## Limits

- File writes made through Bash (`sed -i`, redirection) are not checked.
- Claude Code only; git hooks were deliberately excluded for now.
- The ticket is not looked up in the tracker, so existence, state and order are not verified.

## Tests

`bash .claude/hooks/tests/require-ticket-branch.test.sh`

#!/usr/bin/env bash
# Claude Code PostToolUse hook for rule 8: after a pull request is merged,
# tell the agent to move the ticket to Done.

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
[[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+merge ]] || exit 0

branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current)
key=$(sed -nE 's#^feature/([A-Z][A-Z0-9]*-[0-9]+)-.*#\1#p' <<<"$branch")
echo "Pull request merged. Rule 8: move ticket ${key:-for this branch} to Done in the tracker now." >&2
exit 2

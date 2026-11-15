#!/usr/bin/env bash
# Claude Code PostToolUse hook for rule 8: after `gh pr merge`, tell the agent
# to move the merged pull request's ticket to Done.

command -v jq >/dev/null || { echo "Rule 8: the after-merge hook needs jq. Move the merged pull request's ticket to Done." >&2; exit 2; }
command=$(jq -r '.tool_input.command // ""')
start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
merge_re="${start}gh[[:space:]]+pr[[:space:]]+merge([[:space:];&|)]|\$)([^;&|]*)"
[[ $command =~ $merge_re ]] || exit 0
[[ ${BASH_REMATCH[3]} == *"--auto"* ]] && exit 0   # only queued, not merged yet
echo "Rule 8: if the merge succeeded, move the merged pull request's ticket (the key at the start of its title) to Done in the tracker now." >&2
exit 2

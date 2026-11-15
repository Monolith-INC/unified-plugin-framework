#!/usr/bin/env bash
# Claude Code PostToolUse hook for rule 8: after a pull request is merged,
# tell the agent to move its ticket to Done. The ticket key is read from the
# merged pull request's title, falling back to the current branch name.

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
[[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+merge([^;&|]*) ]] || exit 0
args=${BASH_REMATCH[2]}
[[ $args == *"--auto"* ]] && exit 0   # only queued, not merged yet

target=$(sed -nE 's/^[[:space:]]*([^-[:space:]][^[:space:]]*).*/\1/p' <<<"$args")
title=$(cd "${CLAUDE_PROJECT_DIR:-.}" && gh pr view ${target:+"$target"} --json title -q .title 2>/dev/null)
key=$(sed -nE 's/^([A-Z][A-Z0-9]*-[0-9]+).*/\1/p' <<<"$title")
[ -n "$key" ] || key=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current | sed -nE 's#^feature/([A-Z][A-Z0-9]*-[0-9]+)-.*#\1#p')
echo "Pull request merged. Rule 8: move ticket ${key:-of the merged pull request} to Done in the tracker now." >&2
exit 2

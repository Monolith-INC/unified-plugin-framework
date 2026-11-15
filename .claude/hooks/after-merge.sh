#!/usr/bin/env bash
# Claude Code PostToolUse hook for rule 8: after a pull request is merged,
# tell the agent to move its ticket to Done. The pull request is looked up to
# confirm it merged and to read the ticket key from its title.

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
[[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+merge([^;&|]*) ]] || exit 0
args=${BASH_REMATCH[2]}
[[ $args == *"--auto"* ]] && exit 0   # only queued, not merged yet

# The pull request: a number or URL anywhere in the arguments, else the current branch's.
target=$(grep -oE '(^|[[:space:]])([0-9]+|https?://[^[:space:]]+)' <<<"$args" | head -n 1 | tr -d '[:space:]')
read -r state title < <(cd "${CLAUDE_PROJECT_DIR:-.}" && gh pr view ${target:+"$target"} --json state,title -q '.state + " " + .title' 2>/dev/null)
if [ "${state:-}" != MERGED ]; then
  echo "Rule 8: could not confirm that the pull request merged. Check it, and if it merged, move its ticket to Done in the tracker." >&2
  exit 2
fi
key=$(sed -nE 's/^([A-Z][A-Z0-9]*-[0-9]+).*/\1/p' <<<"$title")
echo "Pull request merged. Rule 8: move ticket ${key:-of the merged pull request} to Done in the tracker now." >&2
exit 2

#!/usr/bin/env bash
# Claude Code and Codex post-tool reminder for verified ticket closeout.

command -v jq >/dev/null || { echo "The after-merge hook needs jq. Verify delivery before closing the ticket." >&2; exit 2; }
command=$(jq -r '.tool_input.command // ""')
start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
merge_re="${start}gh[[:space:]]+pr[[:space:]]+merge([[:space:];&|)]|\$)([^;&|]*)"
[[ $command =~ $merge_re ]] || exit 0
[[ ${BASH_REMATCH[3]} == *"--auto"* ]] && exit 0   # A queued merge leaves the ticket active.
echo "Run python3 .claude/hooks/ticket-flow.py closeout <PR> to verify the merge and refresh main. Then move the ticket to Done and run ticket-flow.py finish --done <TICKET>." >&2
exit 2

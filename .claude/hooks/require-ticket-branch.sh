#!/usr/bin/env bash
# Claude Code PreToolUse hook: rule 1, "ticket first".
# A file inside a git repository may only be changed, and `git commit` may only
# run, while that checkout is on a ticket branch: feature/<KEY>-<n>-<slug>.
# <KEY> is the tracker team from .harness/settings.json (.tracker.values.team);
# without it, any uppercase key is accepted.
#
# Limits: file writes made through Bash (sed -i, redirection) are not checked;
# only the literal form `git commit` is detected, judged by the session's cwd;
# the ticket is not looked up in the tracker.

block() {
  echo "Blocked: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "the ticket-first hook needs jq, which is not installed."

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || block "the ticket-first hook could not parse the tool call."

case $tool in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
    [ -n "$path" ] || exit 0
    dir=$(dirname "$path")
    # Walk up to an existing directory (Write may create new directories).
    while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
    action="change $path"
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    [[ $cmd =~ (^|[^[:alnum:]_-])git[[:space:]]+commit([[:space:]]|$) ]] || exit 0
    dir=$(jq -r '.cwd // empty' <<<"$input")
    dir=${dir:-${CLAUDE_PROJECT_DIR:-.}}
    action="run git commit"
    ;;
  *)
    exit 0
    ;;
esac

top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0   # not in a repository

key=$(jq -r '.tracker.values.team // empty' "$top/.harness/settings.json" 2>/dev/null)
[ -n "$key" ] || key='[A-Z][A-Z0-9]+'
branch=$(git -C "$top" symbolic-ref --short -q HEAD 2>/dev/null)

[[ $branch =~ ^feature/${key}-[0-9]+-[a-z0-9-]+$ ]] && exit 0

example=${key//\[A-Z\]\[A-Z0-9\]+/KEY}
block "cannot $action on branch '${branch:-detached HEAD}'. Take a tracker ticket and create its branch first: git switch -c feature/${example}-<n>-<slug> main"

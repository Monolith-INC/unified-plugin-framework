#!/usr/bin/env bash
# Claude Code PreToolUse hook for the project rules:
#   1. work only on a ticket branch: feature/<KEY>-<n>-<slug>
#   2. the branch was cut from main
# Checked before file edits and `git commit`. Anything this misses is stopped
# by GitHub branch protection on main.

input=$(cat)
project=${CLAUDE_PROJECT_DIR:-.}

case $(jq -r '.tool_name' <<<"$input") in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
    [[ $path == "$project"/* ]] || exit 0 ;;
  Bash)
    [[ $(jq -r '.tool_input.command' <<<"$input") == *"git commit"* ]] || exit 0 ;;
  *) exit 0 ;;
esac

branch=$(git -C "$project" branch --show-current)
if [[ ! $branch =~ ^feature/[A-Z][A-Z0-9]*-[0-9]+-.+ ]]; then
  echo "Blocked: branch '$branch' is not a ticket branch. Create one from main: git switch -c feature/<KEY>-<n>-<slug> main" >&2
  exit 2
fi

base=$(git -C "$project" reflog show --format=%H "refs/heads/$branch" | tail -n 1)
main=$(git -C "$project" rev-parse -q --verify origin/main || git -C "$project" rev-parse -q --verify main)
if [ -n "$base" ] && [ -n "$main" ] && ! git -C "$project" merge-base --is-ancestor "$base" "$main"; then
  echo "Blocked: branch '$branch' was not cut from main. Create the ticket branch from main and move the work there." >&2
  exit 2
fi
exit 0

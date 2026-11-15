#!/usr/bin/env bash
# Claude Code PreToolUse hook for the project rules:
#   1. work only on a ticket branch: feature/<KEY>-<n>-<slug>
#   2. the branch was cut from main
#   5. push or open a pull request only after HEAD passed review
#   6. the pull request title carries the ticket key
#   7. merge only while the owner's approval stands (git config workflow.mergeApproval)
#   9. plan, spec and design markdown files live in docs/work-items/
#  10. implementation changes pass the pnpm checks before push or pull request
# Checked before file edits, `git commit`, `git push` and `gh pr create`. Anything this misses is stopped
# by GitHub branch protection on main.

input=$(cat)
project=${CLAUDE_PROJECT_DIR:-.}

case $(jq -r '.tool_name' <<<"$input") in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
    [[ $path == "$project"/* ]] || exit 0
    # Rule 9: plans and specs live in docs/work-items/.
    name=$(basename "$path" | tr '[:upper:]' '[:lower:]')
    if [[ $name == *.md && $name =~ (plan|spec|design) && $path != "$project"/docs/work-items/* ]]; then
      echo "Blocked: plans and specs go in docs/work-items/. Write it there instead of $path" >&2
      exit 2
    fi ;;
  Bash)
    command=$(jq -r '.tool_input.command' <<<"$input")
    # Only commands that start a line or follow ; & | ( count, not quoted text.
    start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
    commits=$([[ $command =~ ${start}git[[:space:]]+commit ]] && echo y)
    publishes=$([[ $command =~ ${start}(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create) ]] && echo y)
    # Rule 7: merging needs the owner's approval, standing unless withdrawn in chat.
    if [[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+merge ]]; then
      if [ "$(git -C "$project" config --get workflow.mergeApproval)" = withdrawn ]; then
        echo "Blocked: the owner withdrew merge approval. Ask for explicit approval; when it is given, run: git config workflow.mergeApproval standing" >&2
        exit 2
      fi
      exit 0
    fi
    [[ -n $commits || -n $publishes ]] || exit 0 ;;
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

# Rule 5: push or open a pull request only after the confirming review of HEAD.
if [ -n "${publishes:-}" ]; then
  head=$(git -C "$project" rev-parse HEAD)
  if [ "$(git -C "$project" config --get "branch.$branch.reviewed")" != "$head" ]; then
    echo "Blocked: HEAD $head has not passed review. Run the review loop, then record it: git config branch.$branch.reviewed $head" >&2
    exit 2
  fi
  # Rule 10: implementation changes need the pnpm checks to pass on HEAD.
  if [ -n "$main" ] && git -C "$project" diff --name-only "$main...HEAD" \
      | grep -qE '^(packages/|plugins/|fixtures/|package\.json$|pnpm-[a-z-]+\.yaml$|tsconfig[^/]*\.json$)'; then
    if [ "$(git -C "$project" config --get "branch.$branch.checked")" != "$head" ]; then
      echo "Blocked: this branch changes implementation and HEAD $head has not passed the checks. Run pnpm install --frozen-lockfile, pnpm build, pnpm typecheck, pnpm test and pnpm payloads:verify, then record it: git config branch.$branch.checked $head" >&2
      exit 2
    fi
  fi
fi

# Rule 6: the pull request title carries the ticket key (it becomes the squash commit title).
if [[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+create ]]; then
  key=$(sed -E 's#^feature/([A-Z][A-Z0-9]*-[0-9]+)-.*#\1#' <<<"$branch")
  if [[ $command != *"--title"* || $command != *"$key"* ]]; then
    echo "Blocked: open the pull request with the ticket key in the title: gh pr create --title \"$key: <summary>\"" >&2
    exit 2
  fi
fi
exit 0

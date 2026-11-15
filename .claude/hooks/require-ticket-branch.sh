#!/usr/bin/env bash
# Claude Code PreToolUse hook for the project rules:
#   1. work only on a ticket branch: feature/<KEY>-<n>-<slug>
#   2. the branch was cut from main
#   5. push or open a pull request only after HEAD passed review
#   6. the pull request title starts with the ticket key
#   7. merge only while the owner's approval stands (git config workflow.mergeApproval)
#   9. plan, spec and design markdown files live in docs/work-items/
#  10. implementation changes pass the pnpm checks before push or pull request
# Checked before file edits, `git commit`, `git push`, `gh pr create` and
# `gh pr merge`, in the checkout the action targets (file directory or the
# command's working directory). A detached HEAD (rebase, bisect) is not judged.
# Anything this misses is stopped by GitHub branch protection.

block() { echo "Blocked: $1" >&2; exit 2; }

command -v jq >/dev/null || block "the workflow hook needs jq."
input=$(cat)
project=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}
[ -n "$project" ] || exit 0
tool=$(jq -r '.tool_name // ""' <<<"$input") || block "the workflow hook could not read the tool call."
project_common=$(git -C "$project" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0

# checkout_of <dir>: prints the checkout root when <dir> belongs to this project.
checkout_of() {
  local dir=$1
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
  [ "$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" = "$project_common" ] || return 1
  git -C "$dir" rev-parse --show-toplevel 2>/dev/null
}

# Commands count only at the start of a line or after ; & | ( — not inside text.
start='(^|[;&|(][[:space:]]*|'$'\n''[[:space:]]*)'
git_opts='([[:space:]]+-[cC][[:space:]]+[^[:space:]]+)*'
end='([[:space:];&|)]|$)'   # whole command words only (not commit-graph, commit-tree)

case $tool in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
    repo=$(checkout_of "$(dirname "$path")") || exit 0
    # Rule 9: a new markdown file with a plan/spec/design word in its name lives in
    # docs/work-items/. Existing files can still be edited (moving them is cleanup work).
    rel=${path#"$repo"/}; [[ $rel == /* ]] && rel=${path#"$project"/}   # repo path may be symlink-resolved
    rel=$(tr '[:upper:]' '[:lower:]' <<<"$rel")
    name=$(basename "$rel")
    if [ ! -e "$path" ] && [[ $name == *.md && $rel != docs/work-items/* && $name =~ (^|[-_.[:space:]])(plans?|specs?|designs?)([-_.[:space:]]|$) ]]; then
      block "plans and specs go in docs/work-items/. Write it there instead of $path"
    fi ;;
  Bash)
    command=$(jq -r '.tool_input.command // ""' <<<"$input")
    [[ $command =~ ${start}git${git_opts}[[:space:]]+commit${end} ]] && commits=y
    [[ $command =~ ${start}(git${git_opts}[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)${end} ]] && publishes=y
    [[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+create${end} ]] && creates=y
    [[ $command =~ ${start}gh[[:space:]]+pr[[:space:]]+merge${end} ]] && merges=y
    # Rule 7: merging needs the owner's approval, standing unless withdrawn in chat.
    if [ -n "${merges:-}" ] && [ "$(git -C "$project" config --get workflow.mergeApproval)" = withdrawn ]; then
      block "the owner withdrew merge approval. Ask for explicit approval; when it is given, run: git config workflow.mergeApproval standing"
    fi
    [[ -n ${commits:-} || -n ${publishes:-} ]] || exit 0
    # Judge the checkout named by `git -C <dir>`, else the command's working directory.
    dir=$(jq -r '.cwd // ""' <<<"$input"); dir=${dir:-$project}
    if [[ $command =~ git[[:space:]]+-C[[:space:]]+([^[:space:];&|]+) ]]; then
      c=${BASH_REMATCH[1]}; [[ $c == /* ]] && dir=$c || dir=$dir/$c
    fi
    repo=$(checkout_of "$dir") || exit 0 ;;
  *) exit 0 ;;
esac

branch=$(git -C "$repo" branch --show-current)
if [ -z "$branch" ]; then
  # Detached HEAD (rebase, bisect, cherry-pick): edits and commits are allowed, publishing is not.
  [ -z "${publishes:-}" ] || block "push and open pull requests from the ticket branch, not a detached HEAD."
  exit 0
fi
[[ $branch =~ ^feature/([A-Z][A-Z0-9]*-[0-9]+)-.+ ]] \
  || block "branch '$branch' is not a ticket branch. Create one from main: git switch -c feature/<KEY>-<n>-<slug> main"
key=${BASH_REMATCH[1]}

# Rule 2: where the branch was created locally, that point must be on main.
# Branches already on origin, renamed, or with an expired reflog are not judged.
main=$(git -C "$repo" rev-parse -q --verify origin/main || git -C "$repo" rev-parse -q --verify main)
created=$(git -C "$repo" reflog show --format='%H %gs' "refs/heads/$branch" | tail -n 1)
if [[ $created == *" branch: Created from "* ]] && [ -n "$main" ] \
   && ! git -C "$repo" rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null \
   && ! git -C "$repo" merge-base --is-ancestor "${created%% *}" "$main"; then
  block "branch '$branch' was not cut from main. Create the ticket branch from main and move the work there."
fi

if [ -n "${publishes:-}" ]; then
  head=$(git -C "$repo" rev-parse HEAD)
  # Rule 5: push or open a pull request only after the confirming review of HEAD.
  [ "$(git -C "$repo" config --get "branch.$branch.reviewed")" = "$head" ] \
    || block "HEAD $head has not passed review. Run the review loop, then record it: git config branch.$branch.reviewed $head"
  # Rule 10: implementation changes need the pnpm checks to pass on HEAD.
  if [ -n "$main" ] && git -C "$repo" diff --name-only "$main...HEAD" \
      | grep -qE '^(packages/|plugins/|fixtures/|scripts/|package\.json$|pnpm-[a-z-]+\.yaml$|tsconfig[^/]*\.json$|[^/]+\.config\.[cm]?[jt]s$)'; then
    [ "$(git -C "$repo" config --get "branch.$branch.checked")" = "$head" ] \
      || block "this branch changes implementation and HEAD $head has not passed the checks. Run pnpm install --frozen-lockfile, pnpm build, pnpm typecheck, pnpm test and pnpm payloads:verify, then record it: git config branch.$branch.checked $head"
  fi
fi

# Rule 6: the pull request title starts with the ticket key (it becomes the squash commit title).
if [ -n "${creates:-}" ]; then
  title_re="[[:space:]](--title|-t)(=|[[:space:]]+)(\"([^\"]*)\"|'([^']*)'|([^[:space:]]+))"
  [[ $command =~ $title_re ]] && title=${BASH_REMATCH[4]}${BASH_REMATCH[5]}${BASH_REMATCH[6]}
  [[ ${title:-} =~ ^${key}([^0-9]|$) ]] \
    || block "open the pull request with --title starting with the ticket key: gh pr create --title \"$key: <summary>\""
fi
exit 0

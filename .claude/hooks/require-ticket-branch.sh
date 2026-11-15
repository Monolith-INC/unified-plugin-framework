#!/usr/bin/env bash
# Claude Code PreToolUse hook: rule 1, "ticket first".
# In this project's repository (any of its worktrees), a file may only be
# changed, and `git commit` may only run, while the checkout is on a ticket
# branch. The branch pattern comes from .harness/settings.json: branch_template
# (default feature/{key}-{slug}) with {key} = <team>-<n>, team from
# .tracker.values.team (any uppercase key when unset).
#
# Limits: file writes made through Bash (sed -i, redirection) are not checked;
# `git commit` is detected in the command text, so quoted text mentioning it is
# also blocked on a non-ticket branch; the ticket is not looked up in the tracker.

block() {
  echo "Blocked: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "the ticket-first hook needs jq, which is not installed."
command -v git >/dev/null 2>&1 || block "the ticket-first hook needs git, which is not installed."

project=${CLAUDE_PROJECT_DIR:-}
[ -n "$project" ] || exit 0
project_common=$(git -C "$project" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || block "the ticket-first hook could not parse the tool call."

# Is <dir> inside this project's repository? Prints its worktree root if so.
project_root_of() {
  local dir=$1 common top
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
  if ! common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    # Not a repository, or git failed. Fail closed only for paths in the project.
    case "$(cd "$dir" && pwd -P)/" in
      "$(cd "$project" && pwd -P)"/*) block "git could not read the repository at $dir." ;;
    esac
    return 1
  fi
  [ "$common" = "$project_common" ] || return 1
  top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || return 1
  echo "$top"
}

case $tool in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
    [ -n "$path" ] || exit 0
    top=$(project_root_of "$(dirname "$path")") || exit 0
    action="change $path"
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    git_commit='(^|[^[:alnum:]_./-])git(([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|--?[[:alnum:]-]+(=[^[:space:]]+)?))*)[[:space:]]+commit([^[:alnum:]_-]|$)'
    [[ $cmd =~ $git_commit ]] || exit 0
    cwd=$(jq -r '.cwd // empty' <<<"$input")
    # Judge the session's checkout when it belongs to the project; otherwise,
    # if the command names the project, judge the project checkout.
    if ! top=$(project_root_of "${cwd:-$project}"); then
      [[ $cmd == *"$project"* ]] || exit 0
      top=$(project_root_of "$project") || exit 0
    fi
    action="run git commit"
    ;;
  *)
    exit 0
    ;;
esac

# Settings: this checkout first, then the main project checkout (.harness is untracked).
settings=$top/.harness/settings.json
[ -f "$settings" ] || settings=$project/.harness/settings.json
team=$(jq -r '.tracker.values.team // empty' "$settings" 2>/dev/null)
template=$(jq -r '.branch_template // empty' "$settings" 2>/dev/null)
template=${template:-feature/\{key\}-\{slug\}}
example_key=${team:-KEY}
team=${team:-[A-Z][A-Z0-9]+}

pattern=${template//\{key\}/${team}-[0-9]+}
pattern=${pattern//\{slug\}/[A-Za-z0-9._-]+}
example=${template//\{key\}/${example_key}-<n>}
example=${example//\{slug\}/<slug>}

branch=$(git -C "$top" symbolic-ref --short -q HEAD 2>/dev/null)
if [ -z "$branch" ]; then
  # Detached HEAD during a rebase: judge the branch being rebased.
  gitdir=$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)
  for f in "$gitdir/rebase-merge/head-name" "$gitdir/rebase-apply/head-name"; do
    [ -f "$f" ] && branch=$(sed 's#^refs/heads/##' "$f") && break
  done
fi

[[ $branch =~ ^${pattern}$ ]] && exit 0

block "cannot $action on branch '${branch:-detached HEAD}'. Take a tracker ticket and create its branch first: git switch -c $example main"

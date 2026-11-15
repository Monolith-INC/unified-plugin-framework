#!/usr/bin/env bash
# Claude Code PreToolUse hook: rule 1, "ticket first".
# In this project's repository (any of its worktrees), a file may only be
# changed, and `git commit` may only run, while the checkout is on a ticket
# branch. The branch pattern comes from .harness/settings.json: branch_template
# (default feature/{key}-{slug}) with {key} = <team>-<n>, team from
# .tracker.values.team (any uppercase key when unset).
#
# Limits: file writes made through Bash (sed -i, redirection) are not checked;
# `git commit` and its target directories (cwd, `cd <dir>`, `git -C <dir>`) are
# read from the command text, so quoted text mentioning `git commit` is also
# blocked on a non-ticket branch; the ticket is not looked up in the tracker.

block() {
  echo "Blocked: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "the ticket-first hook needs jq, which is not installed."
command -v git >/dev/null 2>&1 || block "the ticket-first hook needs git, which is not installed."

project=${CLAUDE_PROJECT_DIR:-}
[ -n "$project" ] || exit 0
project_common=$(git -C "$project" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
project_top=$(git -C "$project" rev-parse --show-toplevel 2>/dev/null) || exit 0

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null) || block "the ticket-first hook could not parse the tool call."

# project_root_of <dir>: prints the project checkout root that contains <dir>.
# Returns 1 when <dir> is outside the project, 3 when git cannot read a path
# that lies inside the project (callers block on 3).
project_root_of() {
  local dir=$1 common top
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do dir=$(dirname "$dir"); done
  if ! common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    case "$(cd "$dir" && pwd -P)/" in
      "$(cd "$project" && pwd -P)"/*) return 3 ;;
    esac
    return 1
  fi
  [ "$common" = "$project_common" ] || return 1
  # Inside a .git directory there is no work tree; judge the project checkout.
  top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || top=$project_top
  echo "$top"
}

# resolve_top <dir>: sets $top for a directory, blocking when git cannot read it.
resolve_top() {
  local rc
  top=$(project_root_of "$1"); rc=$?
  [ $rc -eq 3 ] && block "git could not read the repository at $1."
  return $rc
}

# Settings: this checkout first, then the main project checkout (.harness is untracked).
load_pattern() {
  local settings=$1/.harness/settings.json team template example_key
  [ -f "$settings" ] || settings=$project/.harness/settings.json
  if [ -f "$settings" ]; then
    jq -e . "$settings" >/dev/null 2>&1 || block "cannot parse $settings; fix it before editing."
    team=$(jq -r '.tracker.values.team // empty' "$settings")
    template=$(jq -r '.branch_template // empty' "$settings")
  fi
  template=${template:-feature/\{key\}-\{slug\}}
  example_key=${team:-KEY}
  [[ -z $team || $team =~ ^[A-Z][A-Z0-9]*$ ]] || block "tracker team '$team' in $settings is not an uppercase key."
  team=${team:-[A-Z][A-Z0-9]+}
  # Escape regex characters in the literal parts, then fill the placeholders.
  pattern=$(printf '%s' "$template" | sed 's/[][\.*^$+?()|]/\\&/g')
  pattern=${pattern//\{key\}/${team}-[0-9]+}
  pattern=${pattern//\{slug\}/[A-Za-z0-9._-]+}
  [[ $pattern == *"{"* ]] && block "branch_template '$template' in $settings has a placeholder other than {key} and {slug}."
  example=${template//\{key\}/${example_key}-<n>}
  example=${example//\{slug\}/<slug>}
}

# require_ticket <checkout root> <action>
require_ticket() {
  local root=$1 action=$2 branch gitdir f
  load_pattern "$root"
  branch=$(git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null)
  if [ -z "$branch" ]; then
    # Detached HEAD during a rebase: judge the branch being rebased.
    gitdir=$(git -C "$root" rev-parse --absolute-git-dir 2>/dev/null)
    for f in "$gitdir/rebase-merge/head-name" "$gitdir/rebase-apply/head-name"; do
      [ -f "$f" ] && branch=$(sed 's#^refs/heads/##' "$f") && break
    done
  fi
  [[ $branch =~ ^${pattern}$ ]] && return 0
  block "cannot $action on branch '${branch:-detached HEAD}' in $root. Take a tracker ticket and create its branch first: git switch -c $example main"
}

case $tool in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
    [ -n "$path" ] || exit 0
    resolve_top "$(dirname "$path")" || exit 0
    require_ticket "$top" "change $path"
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    sep='[^[:alnum:]_.-]'
    opt='(-[cC][[:space:]]+[^[:space:]]+|--(git-dir|work-tree|namespace|exec-path|config-env|super-prefix)[[:space:]]+[^[:space:]]+|--?[[:alnum:]-]+(=[^[:space:]]+)?)'
    git_commit="(^|${sep})([^[:space:]]*/)?git(([[:space:]]+${opt})*)[[:space:]]+commit([^[:alnum:]_-]|$)"
    [[ $cmd =~ $git_commit ]] || exit 0
    cwd=$(jq -r '.cwd // empty' <<<"$input")
    cwd=${cwd:-$project}
    # Every checkout the command may commit in: the cwd, `cd <dir>`, `git -C <dir>`,
    # and the project when its path appears literally.
    dirs=("$cwd")
    rest=$cmd
    while [[ $rest =~ (^|[^[:alnum:]_-])(cd|-C)[[:space:]]+([^[:space:]\;\&\|\)]+)(.*) ]]; do
      d=${BASH_REMATCH[3]}; rest=${BASH_REMATCH[4]}
      d=${d/#\~/$HOME}
      case $d in /*) ;; *) d=$cwd/$d ;; esac
      dirs+=("$d")
    done
    [[ $cmd == *"$project"* ]] && dirs+=("$project")
    for d in "${dirs[@]}"; do
      resolve_top "$d" || continue
      require_ticket "$top" "run git commit"
    done
    ;;
esac
exit 0

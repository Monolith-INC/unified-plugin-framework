#!/usr/bin/env bash
# Tests for .claude/hooks/require-ticket-branch.sh. Exit 1 on any failure.
# Usage: bash .claude/hooks/tests/require-ticket-branch.test.sh

set -u
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR

hook=$(cd "$(dirname "$0")/.." && pwd)/require-ticket-branch.sh
scratch=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$scratch"' EXIT
fail=0

# check <allowed|blocked> <description> <json> [expected stderr text]
check() {
  local want=$1 desc=$2 json=$3 reason=${4:-} got rc
  printf '%s' "$json" | env CLAUDE_PROJECT_DIR="$project" ${PATH_OVERRIDE:+PATH=$PATH_OVERRIDE} /bin/bash "$hook" >/dev/null 2>"$scratch/err"
  rc=$?
  case $rc in 0) got=allowed ;; 2) got=blocked ;; *) got="exit $rc" ;; esac
  if [ "$got" = blocked ] && ! grep -q "${reason:-Take a tracker ticket}" "$scratch/err"; then
    got="blocked for another reason"
  fi
  if [ "$got" = "$want" ]; then echo "PASS $want :: $desc"; else echo "FAIL want $want got $got :: $desc"; cat "$scratch/err"; fail=1; fi
}
edit() { jq -nc --arg t "$1" --arg p "$2" '{tool_name:$t,tool_input:{file_path:$p}}'; }
run() { jq -nc --arg d "$1" --arg c "$2" '{tool_name:"Bash",cwd:$d,tool_input:{command:$c}}'; }
gitc() { git -c user.email=t@example.com -c user.name=t "$@"; }

project=$scratch/repo
git init -q -b main "$project"
gitc -C "$project" commit -q --allow-empty -m init

# On main.
check blocked "Edit on main" "$(edit Edit "$project/a.txt")"
check blocked "Write of a new nested file on main" "$(edit Write "$project/new/dir/b.txt")"
for c in "git commit -m x" "git commit;" "git commit&&git push" "(git commit)" "git -C . commit -m x" \
         "git -c core.editor=true commit" "git --no-pager commit -m x" "ls; git commit --amend"; do
  check blocked "commit form: $c" "$(run "$project" "$c")"
done
check blocked "commit through an absolute git path" "$(run "$project" "/usr/bin/git commit -m x")"
check blocked "commit with --git-dir and --work-tree" "$(run "$project" "git --git-dir .git --work-tree . commit -m x")"
check allowed "non-commit Bash on main" "$(run "$project" "git status")"
check allowed "git log mentioning commit on main" "$(run "$project" "git log --grep commit")"
check allowed "git commit-tree is not git commit" "$(run "$project" "git commit-tree HEAD^{tree}")"
check allowed "Read is not checked" "$(jq -nc --arg p "$project/a.txt" '{tool_name:"Read",tool_input:{file_path:$p}}')"

# Outside the project.
check allowed "Edit outside any repository" "$(edit Edit "$scratch/outside.txt")"
other=$scratch/other
git init -q -b main "$other"
check allowed "Edit in another repository on main" "$(edit Edit "$other/a.txt")"
check allowed "git commit in another repository" "$(run "$other" "git commit -m x")"
check blocked "cd into the project then commit, from outside" "$(run "$scratch" "cd $project && git commit -m x")"
check blocked "relative cd into the project then commit" "$(run "$scratch" "cd repo && git commit -m x")"
check blocked "git -C relative path into the project" "$(run "$scratch" "git -C ./repo commit -m x")"
check blocked "Write inside .git on main" "$(edit Write "$project/.git/hooks/pre-commit")"
mkdir -p "$project/broken" && printf 'gitdir: /nonexistent\n' > "$project/broken/.git"
check blocked "unreadable path inside the project fails closed" "$(edit Edit "$project/broken/x.txt")" "could not read"
rm -rf "$project/broken"

# Ticket branches and the pattern.
git -C "$project" switch -q -c feature/ABC-12-some-work
check allowed "Edit on a ticket branch (any key without settings)" "$(edit Edit "$project/a.txt")"
check allowed "git commit on a ticket branch" "$(run "$project" "git commit -m x")"
git -C "$project" switch -q -c topic/no-ticket
check blocked "Edit on a branch without a ticket" "$(edit Edit "$project/a.txt")"
git -C "$project" switch -q -c feature/abc-12-lowercase-key
check blocked "Edit on a branch with a malformed key" "$(edit Edit "$project/a.txt")"
git -C "$project" switch -q -c feature/ABC-13-fix_v2.1
check allowed "slug with underscore and dot" "$(edit Edit "$project/a.txt")"

# Settings from .harness/settings.json.
mkdir -p "$project/.harness"
printf '{"tracker":{"values":{"team":"AGE"}},"branch_template":"feature/{key}-{slug}"}' > "$project/.harness/settings.json"
git -C "$project" switch -q -c feature/AGE-63-x
check allowed "configured team key" "$(edit Edit "$project/a.txt")"
git -C "$project" switch -q feature/ABC-12-some-work
check blocked "another team's key" "$(edit Edit "$project/a.txt")" "feature/AGE-<n>-<slug>"

# Worktree without .harness uses the main checkout's settings.
git -C "$project" worktree add -q -b feature/ABC-14-wt "$scratch/wt" main
check blocked "worktree judged with the project's team key" "$(edit Edit "$scratch/wt/a.txt")" "feature/AGE-<n>-<slug>"
git -C "$scratch/wt" switch -q -c feature/AGE-64-wt
check allowed "worktree on a ticket branch" "$(edit Edit "$scratch/wt/a.txt")"

# Detached HEAD during a rebase of a ticket branch.
git -C "$project" switch -q feature/AGE-63-x
printf 'a\n' > "$project/c.txt"; gitc -C "$project" add c.txt; gitc -C "$project" commit -q -m one
git -C "$project" switch -q -c feature/AGE-65-y main
printf 'b\n' > "$project/c.txt"; gitc -C "$project" add c.txt; gitc -C "$project" commit -q -m two
gitc -C "$project" rebase -q feature/AGE-63-x >/dev/null 2>&1
check allowed "conflict edit during a rebase of a ticket branch" "$(edit Edit "$project/c.txt")"
gitc -C "$project" rebase --abort
git -C "$project" switch -q --detach HEAD
check blocked "plain detached HEAD" "$(edit Edit "$project/a.txt")"
git -C "$project" switch -q feature/AGE-63-x

# A commit aimed at a non-ticket worktree is judged there, not by the cwd.
git -C "$project" worktree add -q -b topic/plain "$scratch/plainwt" main
check blocked "git -C into a non-ticket worktree from a ticket cwd" "$(run "$project" "git -C $scratch/plainwt commit -m x")"
check blocked "cd into a non-ticket worktree from a ticket cwd" "$(run "$project" "cd ../plainwt && git commit -m x")"

# Settings problems fail closed with a clear reason.
cp "$project/.harness/settings.json" "$scratch/settings.bak"
printf '{"tracker":{"values":{"team":"AGE"}},}' > "$project/.harness/settings.json"
check blocked "malformed settings" "$(edit Edit "$project/a.txt")" "cannot parse"
printf '{"tracker":{"values":{"team":"AGE"}},"branch_template":"{type}/{key}-{slug}"}' > "$project/.harness/settings.json"
check blocked "unknown template placeholder" "$(edit Edit "$project/a.txt")" "placeholder"
printf '{"tracker":{"values":{"team":"AGE"}},"branch_template":"feat.{key}-{slug}"}' > "$project/.harness/settings.json"
git -C "$project" switch -q -c featX-AGE-66-dot
check blocked "template literal dot is not a wildcard" "$(edit Edit "$project/a.txt")"
cp "$scratch/settings.bak" "$project/.harness/settings.json"
git -C "$project" switch -q feature/AGE-63-x

# Missing tools fail closed.
PATH_OVERRIDE=/nonexistent check blocked "missing jq fails closed" "$(edit Edit "$project/a.txt")" "needs jq"
mkdir -p "$scratch/bin"; ln -s "$(command -v jq)" "$scratch/bin/jq"
for t in cat dirname sed; do ln -s "$(command -v $t)" "$scratch/bin/$t"; done
PATH_OVERRIDE=$scratch/bin check blocked "missing git fails closed" "$(edit Edit "$project/a.txt")" "needs git"

exit $fail

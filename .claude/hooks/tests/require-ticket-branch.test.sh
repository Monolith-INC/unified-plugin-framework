#!/usr/bin/env bash
# Tests for .claude/hooks/require-ticket-branch.sh. Exit 1 on any failure.
# Usage: bash .claude/hooks/tests/require-ticket-branch.test.sh

set -u
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR

hook=$(cd "$(dirname "$0")/.." && pwd)/require-ticket-branch.sh
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
fail=0

# check <allowed|blocked> <description> <json>
check() {
  local want=$1 desc=$2 json=$3 got rc
  printf '%s' "$json" | env ${PATH_OVERRIDE:+PATH=$PATH_OVERRIDE} /bin/bash "$hook" >/dev/null 2>"$scratch/err"
  rc=$?
  case $rc in 0) got=allowed ;; 2) got=blocked ;; *) got="exit $rc" ;; esac
  if [ "$got" = "$want" ]; then echo "PASS $want :: $desc"; else echo "FAIL want $want got $got :: $desc"; cat "$scratch/err"; fail=1; fi
}
edit() { printf '{"tool_name":"%s","tool_input":{"file_path":"%s"}}' "$1" "$2"; }
bash_call() { printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$1" "$2"; }

repo=$scratch/repo
git init -q -b main "$repo"
git -C "$repo" -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m init

check blocked "Edit on main" "$(edit Edit "$repo/a.txt")"
check blocked "Write of a new nested file on main" "$(edit Write "$repo/new/dir/b.txt")"
check blocked "git commit on main" "$(bash_call "$repo" "git commit -m x")"
check allowed "non-commit Bash on main" "$(bash_call "$repo" "git status")"
check allowed "git log mentioning commit on main" "$(bash_call "$repo" "git log --grep commit")"
check allowed "Edit outside any repository" "$(edit Edit "$scratch/outside.txt")"
check allowed "Read is not checked" '{"tool_name":"Read","tool_input":{"file_path":"'"$repo"'/a.txt"}}'

git -C "$repo" switch -q -c feature/ABC-12-some-work
check allowed "Edit on a ticket branch (any key)" "$(edit Edit "$repo/a.txt")"
check allowed "git commit on a ticket branch" "$(bash_call "$repo" "git commit -m x")"

git -C "$repo" switch -q -c topic/no-ticket
check blocked "Edit on a branch without a ticket" "$(edit Edit "$repo/a.txt")"
git -C "$repo" switch -q -c feature/abc-12-lowercase-key
check blocked "Edit on a branch with a malformed key" "$(edit Edit "$repo/a.txt")"

mkdir -p "$repo/.harness"
printf '{"tracker":{"values":{"team":"AGE"}}}' > "$repo/.harness/settings.json"
git -C "$repo" switch -q -c feature/AGE-63-x
check allowed "Edit on a branch with the configured team key" "$(edit Edit "$repo/a.txt")"
git -C "$repo" switch -q feature/ABC-12-some-work
check blocked "Edit on a branch with another team's key" "$(edit Edit "$repo/a.txt")"

PATH_OVERRIDE=/nonexistent check blocked "missing jq fails closed" "$(edit Edit "$repo/a.txt")"

exit $fail

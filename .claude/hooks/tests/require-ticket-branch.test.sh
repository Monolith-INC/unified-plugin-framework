#!/usr/bin/env bash
# Tests for .claude/hooks/require-ticket-branch.sh. Exit 1 on any failure.
set -u
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
hook=$(cd "$(dirname "$0")/.." && pwd)/require-ticket-branch.sh
repo=$(mktemp -d); trap 'rm -rf "$repo"' EXIT
fail=0

check() { # check <allowed|blocked> <description> <json>
  local got=allowed
  printf '%s' "$3" | CLAUDE_PROJECT_DIR=$repo bash "$hook" 2>/dev/null || got=blocked
  if [ "$got" = "$1" ]; then echo "PASS $1 :: $2"; else echo "FAIL want $1 got $got :: $2"; fail=1; fi
}
edit() { printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$1"; }
cmd() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }

git init -q -b main "$repo"
git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init

check blocked "edit on main" "$(edit "$repo/a.txt")"
check blocked "git commit on main" "$(cmd "git commit -m x")"
check allowed "other bash on main" "$(cmd "git status")"
check allowed "text mentioning git push is not a push" "$(cmd "echo note: git push and gh pr create later")"
check blocked "git commit after cd" "$(cmd "cd /tmp && git commit -m x")"
check allowed "edit outside the project" "$(edit /tmp/elsewhere.txt)"

git -C "$repo" switch -q -c feature/AGE-1-work main
check allowed "edit on a ticket branch cut from main" "$(edit "$repo/a.txt")"
check allowed "git commit on a ticket branch" "$(cmd "git commit -m x")"

git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m work
check blocked "push before review" "$(cmd "git push -u origin feature/AGE-1-work")"
check blocked "pull request before review" "$(cmd "gh pr create --fill")"
git -C "$repo" config branch.feature/AGE-1-work.reviewed "$(git -C "$repo" rev-parse HEAD)"
check allowed "push after review of HEAD" "$(cmd "git push -u origin feature/AGE-1-work")"
check allowed "pull request after review of HEAD" "$(cmd "gh pr create --fill")"
git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m more
check blocked "push after a new commit since review" "$(cmd "git push")"
git -C "$repo" switch -q -c feature/AGE-2-stacked feature/AGE-1-work
check blocked "ticket branch cut from another branch" "$(edit "$repo/a.txt")"

git -C "$repo" switch -q -c topic/x main
check blocked "branch without a ticket" "$(edit "$repo/a.txt")"

exit $fail

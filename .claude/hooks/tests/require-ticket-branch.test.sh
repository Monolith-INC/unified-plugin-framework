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
check blocked "plan outside docs/work-items" "$(edit "$repo/Implementation_Plans/AGE-1-plan.md")"
check blocked "spec outside docs/work-items" "$(edit "$repo/docs/superpowers/specs/2026-11-15-x-design.md")"
check allowed "plan in docs/work-items" "$(edit "$repo/docs/work-items/2026-11-15-x-plan.md")"
check allowed "other markdown anywhere" "$(edit "$repo/README.md")"

git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m work
check blocked "push before review" "$(cmd "git push -u origin feature/AGE-1-work")"
check blocked "pull request before review" "$(cmd "gh pr create --fill")"
git -C "$repo" config branch.feature/AGE-1-work.reviewed "$(git -C "$repo" rev-parse HEAD)"
check allowed "push after review of HEAD" "$(cmd "git push -u origin feature/AGE-1-work")"
check blocked "pull request without a title" "$(cmd "gh pr create --fill")"
check blocked "pull request title without the ticket key" "$(cmd "gh pr create --title 'add work' --body x")"
check allowed "pull request with the ticket key in the title" "$(cmd "gh pr create --title 'AGE-1: add work' --body x")"
git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m more
check blocked "push after a new commit since review" "$(cmd "git push")"
git -C "$repo" switch -q -c feature/AGE-3-impl main
mkdir -p "$repo/packages/core" && echo x > "$repo/packages/core/a.ts"
git -C "$repo" add packages && git -C "$repo" -c user.email=t@t -c user.name=t commit -q -m impl
git -C "$repo" config branch.feature/AGE-3-impl.reviewed "$(git -C "$repo" rev-parse HEAD)"
check blocked "implementation push before checks" "$(cmd "git push -u origin feature/AGE-3-impl")"
git -C "$repo" config branch.feature/AGE-3-impl.checked "$(git -C "$repo" rev-parse HEAD)"
check allowed "implementation push after checks" "$(cmd "git push -u origin feature/AGE-3-impl")"
git -C "$repo" switch -q feature/AGE-1-work
git -C "$repo" config branch.feature/AGE-1-work.reviewed "$(git -C "$repo" rev-parse HEAD)"
check allowed "non-implementation push needs no checks" "$(cmd "git push")"
check allowed "merge with standing approval (default)" "$(cmd "gh pr merge 5 --squash")"
git -C "$repo" config workflow.mergeApproval withdrawn
check blocked "merge after approval was withdrawn" "$(cmd "gh pr merge 5 --squash")"
git -C "$repo" config workflow.mergeApproval standing
check allowed "merge after approval was restored" "$(cmd "gh pr merge 5 --squash")"
git -C "$repo" switch -q -c feature/AGE-2-stacked feature/AGE-1-work
check blocked "ticket branch cut from another branch" "$(edit "$repo/a.txt")"

git -C "$repo" switch -q -c topic/x main
check blocked "branch without a ticket" "$(edit "$repo/a.txt")"

# Rule 8: reminder after a merge.
after=$(dirname "$hook")/after-merge.sh
git -C "$repo" switch -q feature/AGE-1-work
out=$(cmd "gh pr merge 5 --squash" | CLAUDE_PROJECT_DIR=$repo bash "$after" 2>&1); rc=$?
if [ $rc -eq 2 ] && [[ $out == *"move ticket AGE-1 to Done"* ]]; then echo "PASS reminder after merge"; else echo "FAIL reminder after merge ($rc: $out)"; fail=1; fi
out=$(cmd "git status" | CLAUDE_PROJECT_DIR=$repo bash "$after" 2>&1); rc=$?
if [ $rc -eq 0 ] && [ -z "$out" ]; then echo "PASS no reminder for other commands"; else echo "FAIL no reminder for other commands"; fail=1; fi

exit $fail

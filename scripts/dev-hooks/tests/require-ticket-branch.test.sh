#!/usr/bin/env bash
# Tests for scripts/dev-hooks/require-ticket-branch.sh. Exit 1 on any failure.
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
check blocked "new ticket branch requires the start command" "$(cmd "git switch -c feature/AGE-5-work")"
check blocked "new branch after a chained switch still requires start" "$(cmd "git switch main && git checkout -b feature/AGE-5-work")"
check blocked "new ticket worktree requires the start command" "$(cmd "git worktree add -b feature/AGE-5-work /tmp/work")"
check allowed "git -C selects a directory when resuming a branch" "$(cmd "git -C . switch feature/AGE-5-work")"
check blocked "git -C still guards actual branch creation" "$(cmd "git -C . switch -c feature/AGE-5-work")"
check blocked "git branch cannot create a ticket directly" "$(cmd "git branch feature/AGE-5-work")"
check allowed "listing ticket branches is read-only" "$(cmd "git branch --list feature/AGE-5-work")"
check blocked "git commit after cd" "$(cmd "cd /tmp && git commit -m x")"
check allowed "edit outside the project" "$(edit /tmp/elsewhere.txt)"

git -C "$repo" switch -q -c feature/AGE-1-work main
check allowed "edit on a ticket branch cut from main" "$(edit "$repo/a.txt")"
check allowed "git commit on a ticket branch" "$(cmd "git commit -m x")"
check blocked "plan outside docs/work-items" "$(edit "$repo/Implementation_Plans/AGE-1-plan.md")"
check blocked "spec outside docs/work-items" "$(edit "$repo/docs/superpowers/specs/2026-11-15-x-design.md")"
check allowed "plan in docs/work-items" "$(edit "$repo/docs/work-items/2026-11-15-x-plan.md")"
check allowed "other markdown anywhere" "$(edit "$repo/README.md")"
check allowed "a name that only contains 'plan' inside a word" "$(edit "$repo/docs/explanation.md")"
check blocked "commit on main hidden behind gh pr merge" "$(git -C "$repo" switch -q main; cmd "git commit -m x && gh pr merge 1")"
git -C "$repo" switch -q feature/AGE-1-work

git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m work
check blocked "push before review" "$(cmd "git push -u origin feature/AGE-1-work")"
check blocked "pull request before review" "$(cmd "gh pr create --fill")"
git -C "$repo" config branch.feature/AGE-1-work.reviewed "$(git -C "$repo" rev-parse HEAD)"
check allowed "push after review of HEAD" "$(cmd "git push -u origin feature/AGE-1-work")"
check blocked "pull request without a title" "$(cmd "gh pr create --fill")"
check blocked "pull request title without the ticket key" "$(cmd "gh pr create --title 'add work' --body x")"
check allowed "pull request with the ticket key in the title" "$(cmd "gh pr create --title 'AGE-1: add work' --body x")"
check allowed "short -t title flag" "$(cmd "gh pr create -t 'AGE-1: add work' --body x")"
check blocked "key only in --head, not in the title" "$(cmd "gh pr create --title misc --head feature/AGE-1-work")"
check blocked "a different ticket number in the title" "$(cmd "gh pr create --title 'AGE-12: x'")"
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
# A ticket branch checked out from the remote (fresh clone) is not judged by its reflog.
git -C "$repo" switch -q -c scratch-tip feature/AGE-1-work && git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m remote-work
git -C "$repo" update-ref refs/remotes/origin/feature/AGE-9-remote HEAD && git -C "$repo" switch -q main && git -C "$repo" branch -q -D scratch-tip
git -C "$repo" switch -q -c feature/AGE-9-remote refs/remotes/origin/feature/AGE-9-remote
check allowed "ticket branch checked out from the remote" "$(edit "$repo/a.txt")"
git -C "$repo" switch -q feature/AGE-1-work
check allowed "merge with standing approval (default)" "$(cmd "gh pr merge 5 --squash")"
git -C "$repo" config workflow.mergeApproval withdrawn
check blocked "merge after approval was withdrawn" "$(cmd "gh pr merge 5 --squash")"
git -C "$repo" config workflow.mergeApproval standing
check allowed "merge after approval was restored" "$(cmd "gh pr merge 5 --squash")"
git -C "$repo" switch -q -c feature/AGE-2-stacked feature/AGE-1-work
check blocked "ticket branch cut from another branch" "$(edit "$repo/a.txt")"

git -C "$repo" switch -q -c topic/x main
check blocked "branch without a ticket" "$(edit "$repo/a.txt")"

# Review round 2 cases.
git -C "$repo" switch -q main
check blocked "git -C . commit on main" "$(cmd "git -C . commit -m x")"
check blocked "git -c k=v commit on main" "$(cmd "git -c a=b commit -m x")"
git -C "$repo" switch -q feature/AGE-1-work
check allowed "--title=value form" "$(cmd "gh pr create --title='AGE-1: x'")"
check blocked "plan word separated by a space" "$(edit "$repo/Implementation_Plans/Session archive plan.md")"
check allowed "markdown inside a design-named folder" "$(edit "$repo/packages/design-system/README.md")"
mkdir -p "$repo/Implementation_Plans" && echo x > "$repo/Implementation_Plans/AGE-5-old.md"
check allowed "existing plan file outside docs/work-items can be edited" "$(edit "$repo/Implementation_Plans/AGE-5-old.md")"
check allowed "git commit-graph is not git commit" "$(git -C "$repo" switch -q main; cmd "git commit-graph verify")"
git -C "$repo" switch -q feature/AGE-1-work
ln -s "$repo" "$repo-link"
printf '%s' "$(edit "$repo-link/docs/work-items/2026-11-15-y-plan.md")" | CLAUDE_PROJECT_DIR=$repo-link bash "$hook" 2>/dev/null \
  && echo "PASS allowed :: plan in docs/work-items through a symlinked project path" || { echo "FAIL symlinked project path"; fail=1; }
rm -f "$repo-link"
git -C "$repo" switch -q --detach HEAD
check allowed "detached HEAD (rebase in progress) is not judged" "$(edit "$repo/a.txt")"
check blocked "push from a detached HEAD" "$(cmd "git push origin HEAD:feature/AGE-1-work")"
git -C "$repo" switch -q main
git -C "$repo" worktree add -q -b feature/AGE-4-wt "$repo-wt" main
check allowed "edit in a ticket worktree while the main checkout is on main" "$(edit "$repo-wt/a.txt")"
check blocked "edit in the main checkout on main" "$(edit "$repo/a.txt")"
git -C "$repo" config workflow.ticketFlow '{"branch":"feature/AGE-1-work","merge":"","tip":""}'
check blocked "linked worktree shares the active ticket guard" "$(edit "$repo-wt/a.txt")"
git -C "$repo" worktree remove -f "$repo-wt"
git -C "$repo" switch -q feature/AGE-1-work

git -C "$repo" config workflow.ticketFlow '{"branch":"feature/AGE-3-impl","merge":"","tip":""}'
check blocked "different active ticket blocks file edits" "$(edit "$repo/a.txt")"
check blocked "different active ticket blocks commits" "$(cmd "git commit -m x")"
git -C "$repo" config workflow.ticketFlow '{"branch":"feature/AGE-1-work","merge":"","tip":""}'
check allowed "active ticket can continue" "$(edit "$repo/a.txt")"
sha=$(git -C "$repo" rev-parse HEAD)
git -C "$repo" config workflow.ticketFlow "$(jq -nc --arg sha "$sha" '{branch:"feature/AGE-1-work",merge:$sha,tip:$sha}')"
check blocked "delivered ticket requires closeout before new edits" "$(edit "$repo/a.txt")"

# AGE-151: implementation file inventory enforcement + AI_Codex/Implementation_Plans allowance
git -C "$repo" config --unset workflow.ticketFlow
guard=$(dirname "$hook")/inventory-guard.py
check allowed "plan in AI_Codex/Implementation_Plans" "$(edit "$repo/AI_Codex/Implementation_Plans/2026-11-21-x-plan.md")"
(cd "$repo" && python3 -B "$guard" set --branch feature/AGE-1-work --files allowed.txt >/dev/null)
check allowed "edit inside approved file inventory" "$(edit "$repo/allowed.txt")"
check blocked "edit outside approved file inventory" "$(edit "$repo/outside.txt")"
(cd "$repo" && python3 -B "$guard" allow --branch feature/AGE-1-work outside.txt >/dev/null)
check allowed "edit allowed after inventory amendment" "$(edit "$repo/outside.txt")"
(cd "$repo" && python3 -B "$guard" clear --branch feature/AGE-1-work >/dev/null)

# Rule 8: instructions after a merge, rather than treating the command as proof.
after=$(dirname "$hook")/after-merge.sh
out=$(cmd "gh pr merge --squash" | CLAUDE_PROJECT_DIR=$repo bash "$after" 2>&1); rc=$?
if [ $rc -eq 2 ] && [[ $out == *"verify the merge and refresh main"* && $out == *"Then move the ticket to Done"* ]]; then echo "PASS reminder after merge"; else echo "FAIL reminder after merge ($rc: $out)"; fail=1; fi
out=$(cmd "git status" | CLAUDE_PROJECT_DIR=$repo bash "$after" 2>&1); rc=$?
if [ $rc -eq 0 ] && [ -z "$out" ]; then echo "PASS no reminder for other commands"; else echo "FAIL no reminder for other commands"; fail=1; fi
out=$(cmd "gh pr merge 5 --auto --squash" | CLAUDE_PROJECT_DIR=$repo bash "$after" 2>&1); rc=$?
if [ $rc -eq 0 ] && [ -z "$out" ]; then echo "PASS no closeout for a queued merge"; else echo "FAIL queued merge reminder ($rc: $out)"; fail=1; fi

exit $fail

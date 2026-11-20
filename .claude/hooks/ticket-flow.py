#!/usr/bin/env python3
"""Start and close a ticket in this repository, with one active branch per clone."""

import argparse
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import fcntl
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Callable, Iterator


MAIN = "main"
ORIGIN_MAIN = "refs/remotes/origin/main"
REPOSITORY = "Monolith-INC/unified-plugin-framework"
STATE = "workflow.ticketFlow"
KEY = r"[A-Z][A-Z0-9]*-[0-9]+"
BRANCH = re.compile(rf"feature/({KEY})-[a-z0-9]+(?:-[a-z0-9]+)*")
SHA = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")


class Refusal(Exception):
    """A failed command or precondition at the delivery boundary."""


@dataclass(frozen=True)
class Ticket:
    branch: str
    merge: str = ""
    tip: str = ""

    @property
    def key(self) -> str:
        prefix, number, _ = self.branch.removeprefix("feature/").split("-", 2)
        return f"{prefix}-{number}"


def run(repo: Path, *command: str, accepted: tuple[int, ...] = (0,)) -> subprocess.CompletedProcess:
    result = subprocess.run(command, cwd=repo, capture_output=True, text=True, timeout=25, check=False)
    if result.returncode not in accepted:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise Refusal(f"{' '.join(command[:2])} failed: {detail}")
    return result


def git(repo: Path, *args: str) -> str:
    return run(repo, "git", *args).stdout.rstrip("\n")


def github(repo: Path, *args: str) -> object:
    return json.loads(run(repo, "gh", "pr", *args, "--repo", REPOSITORY).stdout)


def branch(repo: Path) -> str:
    return git(repo, "branch", "--show-current")


def current(repo: Path) -> Ticket | None:
    result = run(repo, "git", "config", "--local", "--get", STATE, accepted=(0, 1))
    match (result.returncode, result.stdout.strip()):
        case (1, _) | (0, "null"):
            return None
        case (0, value):
            match json.loads(value):
                case {"branch": str(name), "merge": "", "tip": ""} if BRANCH.fullmatch(name):
                    return Ticket(name)
                case {"branch": str(name), "merge": str(merge), "tip": str(tip)} if BRANCH.fullmatch(name) and SHA.fullmatch(merge) and SHA.fullmatch(tip):
                    return Ticket(name, merge, tip)
    raise Refusal("The active ticket record is unreadable. Inspect the repository's ticket status before continuing.")


def save(repo: Path, ticket: Ticket | None) -> str:
    return git(repo, "config", "--local", STATE, json.dumps(asdict(ticket) if ticket else None))


@contextmanager
def serialized(repo: Path) -> Iterator[None]:
    lock = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir")) / "upf-ticket-flow.lock"
    with lock.open("ab") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise Refusal("Another checkout is starting or closing a ticket. Wait for it to finish, then retry.") from error
        yield


def clean(repo: Path) -> None:
    if git(repo, "status", "--porcelain", "--untracked-files=normal"):
        raise Refusal(f"Preserve or finish the uncommitted work in {repo} before switching branches.")


def on_branch(repo: Path, name: str) -> None:
    if branch(repo) != name:
        raise Refusal(f"Switch to {name} first, preserving any existing work.")


def synchronized(repo: Path) -> str:
    head = git(repo, "rev-parse", "HEAD")
    if head != git(repo, "rev-parse", ORIGIN_MAIN):
        raise Refusal("Local main and origin/main differ. Reconcile unpushed or divergent commits before continuing.")
    return head


def refresh(repo: Path) -> str:
    on_branch(repo, MAIN)
    clean(repo)
    git(repo, "pull", "--ff-only", "origin", MAIN)
    return synchronized(repo)


def pr_record(raw: object) -> tuple[str, str, str] | None:
    match raw:
        case {
            "state": "MERGED", "baseRefName": "main", "isCrossRepository": False,
            "headRefName": str(name), "headRefOid": str(head), "mergeCommit": {"oid": str(merge)},
        } if SHA.fullmatch(head) and SHA.fullmatch(merge):
            return name, head, merge
        case _:
            return None


PR_FIELDS = "state,baseRefName,isCrossRepository,headRefName,headRefOid,mergeCommit"


def ancestor(repo: Path, old: str, new: str) -> bool:
    return run(repo, "git", "merge-base", "--is-ancestor", old, new, accepted=(0, 1, 128)).returncode == 0


def landed(repo: Path, name: str, tip: str, base: str, raw: object) -> bool:
    match pr_record(raw):
        case (head, sha, merge) if (head, sha) == (name, tip):
            return ancestor(repo, merge, base)
        case _:
            return False


def no_open_pr(repo: Path) -> None:
    fields = ("--state", "open", "--limit", "100", "--json", "headRefName,url")
    branches = git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads/feature/").splitlines()
    owned = github(repo, "list", "--author", "@me", *fields)
    records = github(repo, "list", *fields) if branches else []
    if not isinstance(owned, list) or not isinstance(records, list) or max(len(owned), len(records)) >= 100:
        raise Refusal("Could not check all open pull requests. Resolve that before starting a ticket.")
    pending = next((row for row in (*owned, *(row for row in records if row["headRefName"] in branches))
                    if BRANCH.fullmatch(row["headRefName"])), None)
    if pending:
        raise Refusal(f"Finish {pending['headRefName']} before starting another ticket: {pending['url']}")


@dataclass(frozen=True)
class Checkout:
    path: Path
    branch: str


def checkouts(repo: Path) -> tuple[Checkout, ...]:
    def checkout(record: str) -> Checkout | None:
        fields = record.splitlines()
        ref = next((field.removeprefix("branch refs/heads/") for field in fields
                    if field.startswith("branch refs/heads/")), None)
        match (fields, ref):
            case ([first, *_], str(name)) if first.startswith("worktree "):
                return Checkout(Path(first.removeprefix("worktree ")), name)
            case _:
                return None

    worktrees = git(repo, "-c", "core.quotePath=false", "worktree", "list", "--porcelain")
    return tuple(filter(None, map(checkout, worktrees.split("\n\n"))))


def checkout_for(repo: Path, name: str) -> Path | None:
    return next((item.path for item in checkouts(repo) if item.branch == name), None)


def dirty_ticket_checkout(repo: Path) -> Path | None:
    return next((item.path for item in checkouts(repo) if BRANCH.fullmatch(item.branch)
                 and (not item.path.is_dir() or git(item.path, "status", "--porcelain"))), None)


def unfinished_branch(repo: Path, base: str) -> str | None:
    def unfinished(row: str) -> bool:
        name, head = row.split("\t", 1)
        if not BRANCH.fullmatch(name) or ancestor(repo, head, base):
            return False
        records = github(repo, "list", "--state", "merged", "--head", name, "--limit", "100", "--json", PR_FIELDS)
        return not isinstance(records, list) or not any(landed(repo, name, head, base, item) for item in records)

    refs = git(repo, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads/feature/")
    return next((row.split("\t", 1)[0] for row in refs.splitlines() if unfinished(row)), None)


def require_idle(repo: Path, requested: str) -> None:
    match current(repo):
        case Ticket(name, "") if name == requested and not local_branch_exists(repo, name):
            return
        case Ticket(name):
            raise Refusal(f"Finish {name} before starting another ticket. Check its pull request and closeout status.")


def local_branch_exists(repo: Path, name: str) -> bool:
    return run(repo, "git", "show-ref", "--verify", "--quiet", f"refs/heads/{name}", accepted=(0, 1)).returncode == 0


def remote_branch_exists(repo: Path, name: str) -> bool:
    return run(repo, "git", "ls-remote", "--exit-code", "--heads", "origin", f"refs/heads/{name}",
               accepted=(0, 2)).returncode == 0


def start(repo: Path, name: str) -> str:
    if not BRANCH.fullmatch(name):
        raise Refusal("Use feature/<TICKET-123>-<lowercase-slug>.")
    require_idle(repo, name)
    if local_branch_exists(repo, name):
        raise Refusal(f"{name} already exists. Switch to it and run ticket-flow.py resume.")
    base = refresh(repo)
    if remote_branch_exists(repo, name):
        raise Refusal(f"{name} already exists on origin. Fetch and check out that branch, then run ticket-flow.py resume.")
    no_open_pr(repo)
    if pending := dirty_ticket_checkout(repo) or unfinished_branch(repo, base):
        raise Refusal(f"Unfinished work: {pending}. Resume that ticket before starting another.")
    # Reserve the ticket before creating its branch. A failed checkout can be
    # retried through start when the reserved branch does not exist yet.
    save(repo, Ticket(name))
    git(repo, "switch", "-c", name, base)
    return f"Started {name} at {base}. Use the existing work session for this ticket."


def resume(repo: Path) -> str:
    name = branch(repo)
    if not BRANCH.fullmatch(name):
        raise Refusal("Switch to the existing ticket branch to resume its work.")
    match current(repo):
        case None:
            save(repo, Ticket(name))
        case Ticket(other) if other != name:
            raise Refusal(f"Finish {other} before resuming {name}.")
    return f"Active ticket branch: {name}"


def active(repo: Path) -> Ticket:
    ticket = current(repo)
    if ticket is None:
        raise Refusal("No ticket is registered. From its branch, run ticket-flow.py resume.")
    return ticket


def guard(repo: Path, name: str) -> str:
    match current(repo):
        case Ticket(other) if other != name:
            raise Refusal(f"Finish {other} before working on {name}. Find its PR with gh pr view {other}.")
        case Ticket(other, merge) if merge:
            raise Refusal(f"Delivery for {other} is verified. Finish its tracker and session closeout from main.")
        case None if run(repo, "git", "show-ref", "--verify", "--quiet", ORIGIN_MAIN, accepted=(0, 1)).returncode == 0:
            raise Refusal("Register the existing ticket branch with python3 .claude/hooks/ticket-flow.py resume.")
        case _:
            return ""


def guard_merge(repo: Path, number: str) -> str:
    match current(repo):
        case None:
            return ""
        case Ticket(name):
            if not number.isdecimal():
                raise Refusal(f"Merge the active ticket {name} by PR number: gh pr merge <PR>.")
            pr = github(repo, "view", number, "--json", "headRefName,baseRefName,isCrossRepository")
            match pr:
                case {"headRefName": head, "baseRefName": "main", "isCrossRepository": False} if head == name:
                    return ""
                case _:
                    raise Refusal(f"PR #{number} does not deliver {name}. Finish the active ticket first.")


def main_checkout(repo: Path) -> Path:
    match checkout_for(repo, MAIN):
        case Path() as path:
            return path
        case None:
            git(repo, "switch", MAIN)
            return repo


def closeout(repo: Path, number: str) -> str:
    ticket = active(repo)
    clean(repo)
    here = branch(repo)
    if here not in (MAIN, ticket.branch):
        raise Refusal(f"Run closeout from {ticket.branch} or main.")
    tip = git(repo, "rev-parse", f"refs/heads/{ticket.branch}")
    pr = github(repo, "view", number, "--json", PR_FIELDS)
    match pr_record(pr):
        case (name, head, merge) if (name, head) == (ticket.branch, tip):
            default_checkout = main_checkout(repo)
            main = refresh(default_checkout)
            if not ancestor(repo, merge, main):
                raise Refusal("The merge is missing from refreshed main. Keep the ticket active and confirm its delivery.")
            save(repo, Ticket(ticket.branch, merge, tip))
            return (f"Verified PR #{number} on refreshed main in {default_checkout}. "
                    f"Mark {ticket.key} Done, then run ticket-flow.py finish --done {ticket.key}.")
        case _:
            raise Refusal(f"PR #{number} must be merged into main from this repository at the current tip of {ticket.branch}.")


def close_bound_session(repo: Path, ticket: Ticket) -> None:
    if not (repo / ".harness" / "settings.json").is_file():
        return
    status = run(repo, "harness", "session", "status").stdout.strip()
    match status:
        case value if re.fullmatch(rf"HS-[A-Z0-9]+: {re.escape(ticket.key)} on {re.escape(ticket.branch)} \((?:active|paused)\)", value):
            run(repo, "harness", "session", "close")
        case value if value == f"no open session on branch {ticket.branch!r} in this checkout":
            return
        case _:
            raise Refusal(f"Could not verify the existing work session for {ticket.branch}: {status}")


def close_session(repo: Path, ticket: Ticket) -> None:
    match checkout_for(repo, ticket.branch):
        case Path() as path:
            clean(path)
            close_bound_session(path, ticket)
            return
    if not (repo / ".harness" / "settings.json").is_file():
        return
    git(repo, "switch", ticket.branch)
    try:
        close_bound_session(repo, ticket)
    finally:
        git(repo, "switch", MAIN)


def finish(repo: Path, done: str) -> str:
    ticket = active(repo)
    if done != ticket.key or not ticket.merge:
        raise Refusal(f"Verify delivery with closeout, then mark {ticket.key} Done before finishing.")
    default_checkout = checkout_for(repo, MAIN)
    if default_checkout is None:
        raise Refusal("Open main before finishing the ticket.")
    main = refresh(default_checkout)
    if git(repo, "rev-parse", f"refs/heads/{ticket.branch}") != ticket.tip:
        raise Refusal("The ticket branch changed after closeout. Verify the new tip before clearing the ticket.")
    if not ancestor(repo, ticket.merge, main):
        raise Refusal("The verified delivery is no longer on main. Investigate before clearing the active ticket.")
    # Harness sessions are branch-bound, so close the existing session from its
    # ticket branch after the agent has marked the ticket Done.
    close_session(default_checkout, ticket)
    on_branch(default_checkout, MAIN)
    synchronized(default_checkout)
    save(repo, None)
    return f"{ticket.key} closed. Main is current in {default_checkout}. The next ticket can start there."


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("start").add_argument("branch")
    commands.add_parser("resume")
    commands.add_parser("closeout").add_argument("pr", type=int)
    commands.add_parser("finish").add_argument("--done", required=True, metavar="TICKET")
    commands.add_parser("guard", help=argparse.SUPPRESS).add_argument("branch")
    commands.add_parser("guard-merge", help=argparse.SUPPRESS).add_argument("pr", nargs="?", default="")
    args = parser.parse_args()
    actions: dict[str, Callable[[Path], str]] = {
        "start": lambda repo: start(repo, args.branch),
        "resume": resume,
        "closeout": lambda repo: closeout(repo, str(args.pr)),
        "finish": lambda repo: finish(repo, args.done),
        "guard": lambda repo: guard(repo, args.branch),
        "guard-merge": lambda repo: guard_merge(repo, args.pr),
    }
    try:
        repo = Path(git(Path.cwd(), "rev-parse", "--show-toplevel"))
        if args.action in ("guard", "guard-merge"):
            actions[args.action](repo)
            return 0
        with serialized(repo):
            print(actions[args.action](repo))
        return 0
    except (Refusal, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        print(f"Blocked: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

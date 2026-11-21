#!/usr/bin/env python3
"""Enforce an approved per-branch implementation file inventory (AGE-151).

Stores the approved file inventory under <git-common-dir>/upf-file-inventory.json
so linked worktrees share the same guard without polluting the working tree.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

INVENTORY_FILENAME = "upf-file-inventory.json"
ALWAYS_ALLOWED_PREFIXES = ("docs/work-items/", "AI_Codex/Implementation_Plans/")
KNOWN_ROOT_FILES = frozenset({"LICENSE", "NOTICE", "Makefile", "Dockerfile", "CHANGELOG", "README"})
_BACKTICK_RE = re.compile(r"`([^`\n]+)`")


def _git_common_dir(cwd: Path) -> Path:
    out = subprocess.check_output(
        ["git", "-C", str(cwd), "rev-parse", "--path-format=absolute", "--git-common-dir"],
        text=True,
    ).strip()
    return Path(out)


def _normalize_rel(path: str) -> str:
    cleaned = path.replace("\\", "/").strip()
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    return cleaned.rstrip("/")


def _looks_like_path(candidate: str) -> bool:
    if not candidate or candidate in (".", "..") or " " in candidate or candidate.startswith("-"):
        return False
    return "/" in candidate or "." in candidate or candidate in KNOWN_ROOT_FILES


def parse_inventory_from_plan(markdown: str) -> tuple[str, ...]:
    """Extract backtick-quoted file paths from a Markdown plan's File Inventory section."""
    lines = markdown.replace("\r\n", "\n").splitlines()
    in_section = False
    section_level = 2
    paths: list[str] = []
    seen: set[str] = set()
    for line in lines:
        stripped = line.strip()
        heading = re.match(r"^(#{2,4})\s+(.+)$", stripped)
        if heading:
            level = len(heading.group(1))
            if not in_section and re.search(r"\bFile Inventory\b", heading.group(2), re.IGNORECASE):
                in_section = True
                section_level = level
                continue
            if in_section and level <= section_level:
                break
        if not in_section:
            continue
        if not (re.match(r"^\s*[-*]\s+", line) or re.match(r"^\s*\d+\.\s+", line) or stripped.startswith("|")):
            continue
        for raw in _BACKTICK_RE.findall(line):
            candidate = _normalize_rel(raw)
            if _looks_like_path(candidate) and candidate not in seen:
                seen.add(candidate)
                paths.append(candidate)
    return tuple(paths)


def _inventory_file(cwd: Path) -> Path:
    return _git_common_dir(cwd) / INVENTORY_FILENAME


def _load_state(path: Path) -> dict[str, list[str]]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_state(path: Path, state: dict[str, list[str]]) -> None:
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def is_path_allowed(rel_path: str, approved: list[str]) -> bool:
    norm = _normalize_rel(rel_path)
    if any(norm.lower().startswith(prefix.lower()) for prefix in ALWAYS_ALLOWED_PREFIXES):
        return True
    for entry in approved:
        target = _normalize_rel(entry)
        if norm == target or norm.startswith(target + "/"):
            return True
    return False


def cmd_set(cwd: Path, branch: str, *, plan_path: Path | None, files: list[str]) -> int:
    collected: list[str] = []
    if plan_path is not None:
        collected.extend(parse_inventory_from_plan(plan_path.read_text(encoding="utf-8")))
    collected.extend(_normalize_rel(f) for f in files if f.strip())
    deduped = sorted(set(collected))
    if not deduped:
        sys.stderr.write("Blocked: file inventory is empty; list at least one file path.\n")
        return 2
    inv_file = _inventory_file(cwd)
    state = _load_state(inv_file)
    state[branch] = deduped
    _save_state(inv_file, state)
    sys.stdout.write(json.dumps({"branch": branch, "files": deduped}, indent=2) + "\n")
    return 0


def cmd_allow(cwd: Path, branch: str, files: list[str]) -> int:
    inv_file = _inventory_file(cwd)
    state = _load_state(inv_file)
    current = set(state.get(branch, []))
    for item in files:
        norm = _normalize_rel(item)
        if norm:
            current.add(norm)
    state[branch] = sorted(current)
    _save_state(inv_file, state)
    sys.stdout.write(json.dumps({"branch": branch, "files": state[branch]}, indent=2) + "\n")
    return 0


def cmd_clear(cwd: Path, branch: str) -> int:
    inv_file = _inventory_file(cwd)
    state = _load_state(inv_file)
    if branch in state:
        del state[branch]
        _save_state(inv_file, state)
    return 0


def cmd_check(cwd: Path, branch: str, rel_path: str) -> int:
    inv_file = _inventory_file(cwd)
    state = _load_state(inv_file)
    if branch not in state:
        return 0
    if is_path_allowed(rel_path, state[branch]):
        return 0
    norm = _normalize_rel(rel_path)
    sys.stderr.write(
        f"Blocked: '{norm}' is outside the approved file inventory for branch '{branch}'. "
        "Ask the user for permission first, then record the addition with: "
        f"python3 scripts/dev-hooks/inventory-guard.py allow --branch {branch} {norm}\n"
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enforce per-branch implementation file inventories.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_set = sub.add_parser("set", help="Register the approved file inventory for a branch.")
    p_set.add_argument("--branch", required=True)
    p_set.add_argument("--plan", default=None, help="Markdown implementation plan containing a File Inventory section.")
    p_set.add_argument("--files", nargs="*", default=[])

    p_allow = sub.add_parser("allow", help="Add user-approved file paths to the branch inventory.")
    p_allow.add_argument("--branch", required=True)
    p_allow.add_argument("files", nargs="+")

    p_clear = sub.add_parser("clear", help="Remove the stored file inventory for a branch.")
    p_clear.add_argument("--branch", required=True)

    p_check = sub.add_parser("check", help="Check whether a project-relative path is in the branch inventory.")
    p_check.add_argument("--branch", required=True)
    p_check.add_argument("--path", required=True)

    args = parser.parse_args(argv)
    cwd = Path.cwd()
    if args.command == "set":
        return cmd_set(cwd, args.branch, plan_path=Path(args.plan) if args.plan else None, files=args.files)
    if args.command == "allow":
        return cmd_allow(cwd, args.branch, args.files)
    if args.command == "clear":
        return cmd_clear(cwd, args.branch)
    if args.command == "check":
        return cmd_check(cwd, args.branch, args.path)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

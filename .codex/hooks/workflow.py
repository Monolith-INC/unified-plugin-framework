#!/usr/bin/env python3
"""Translate Codex events; the Claude hooks remain the workflow authority."""

import json
import os
from pathlib import Path
import subprocess
import sys


def absolute_path(cwd: str, path: str) -> str:
    return os.path.abspath(os.path.join(cwd, path))


def patch_paths(patch: str) -> tuple[str, ...]:
    headers = ("*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: ")
    return tuple(map(
        lambda line: line.split(": ", 1)[1],
        filter(lambda line: line.startswith(headers), patch.splitlines()),
    ))


def normalized_events(event: dict) -> tuple[dict, ...]:
    cwd = event.get("tool_cwd") or event["cwd"]
    match event["tool_name"]:
        case "apply_patch":
            patch = event["tool_input"]["command"]
            paths = patch_paths(patch)
            if not (patch.startswith("*** Begin Patch\n") and patch.rstrip().endswith("*** End Patch") and paths):
                raise ValueError("cannot identify file paths in the Codex patch")
            return tuple(map(lambda path: {
                "tool_name": "Edit",
                "cwd": cwd,
                "tool_input": {"file_path": absolute_path(cwd, path)},
            }, paths))
        case "Edit" | "Write" | "MultiEdit" | "NotebookEdit":
            field = "notebook_path" if event["tool_name"] == "NotebookEdit" else "file_path"
            return ({**event, "cwd": cwd, "tool_input": {
                **event["tool_input"],
                field: absolute_path(cwd, event["tool_input"][field]),
            }},)
        case _:
            return ({**event, "cwd": cwd},)


def invoke(project: Path, hook: str, event: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        ("bash", str(project / ".claude" / "hooks" / hook)),
        input=json.dumps(event), text=True, capture_output=True,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(project)}, check=False,
    )


def run(project: Path, phase: str, event: dict) -> tuple[int, str, str]:
    match phase:
        case "pre":
            results = map(
                lambda normalized: invoke(project, "require-ticket-branch.sh", normalized),
                normalized_events(event),
            )
            failure = next(filter(lambda result: result.returncode != 0, results), None)
            match failure:
                case None:
                    return (0, "", "")
                case _:
                    return (2, "", failure.stderr or "Blocked: workflow check failed.\n")
        case "post":
            result = invoke(project, "after-merge.sh", event)
            return (result.returncode, result.stdout, result.stderr)
        case _:
            raise ValueError("expected pre or post phase")


def main() -> int:
    try:
        code, output, error = run(
            Path(__file__).resolve().parents[2], sys.argv[1], json.load(sys.stdin),
        )
        sys.stdout.write(output)
        sys.stderr.write(error)
        return code
    except (ValueError, KeyError, TypeError, IndexError, AttributeError, OSError) as error:
        sys.stderr.write(f"Blocked: Codex workflow adapter could not process the event: {error}\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())

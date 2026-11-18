"""Standalone command line boundary for the vendored project knowledge server."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from upf_knowledge.config import ConfigError, ConfigInput, select_store


def _read_object(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read valid JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"Configuration at {path} must be a JSON object.")
    return value


def _normalized(value: str | None, project: Path) -> str | None:
    if value is None:
        return None
    path = Path(value).expanduser()
    return str((project / path).resolve() if not path.is_absolute() else path.resolve())


def _configuration(project: Path, explicit_root: str | None) -> ConfigInput:
    owned_path = project / ".project-knowledge.json"
    legacy_path = project / ".monolithic-code-review" / "sources.json"
    owned = _read_object(owned_path)
    legacy = _read_object(legacy_path)
    if owned is not None and (owned.get("schemaVersion") != 1 or
                              not isinstance(owned.get("knowledgeRoot"), str) or
                              not owned["knowledgeRoot"].strip()):
        raise ValueError(f"Configuration at {owned_path} must contain schemaVersion 1 and a non-empty knowledgeRoot.")
    legacy_knowledge = legacy.get("knowledge") if legacy is not None else None
    if legacy is not None and legacy_knowledge is not None and not isinstance(legacy_knowledge, dict):
        raise ValueError(f"Configuration at {legacy_path} has an invalid knowledge object.")
    legacy_root = legacy_knowledge.get("root") if isinstance(legacy_knowledge, dict) else None
    if legacy_root is not None and (not isinstance(legacy_root, str) or not legacy_root.strip()):
        raise ValueError(f"Configuration at {legacy_path} has an invalid knowledge.root.")
    return ConfigInput(
        project=str(project),
        explicit_root=_normalized(explicit_root, project),
        configured_root=_normalized(owned["knowledgeRoot"], project) if owned else None,
        review_root=_normalized(legacy_root, project),
    )


def _error(code: str, message: str) -> int:
    print(json.dumps({"ok": False, "code": code, "message": message}), file=sys.stderr)
    return 2


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="upf-project-knowledge")
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--root")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--verify", action="store_true", help="Verify catalog, search and fetch over a fresh MCP connection.")
    parser.add_argument("--read-repository", action="store_true", help="Expose only read-only repository tools over MCP.")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Check a selected store and start the inherited server when requested."""
    args = _parser().parse_args(argv)
    if sys.platform not in {"linux", "darwin"}:
        return _error("unsupported_platform", "Project knowledge server supports Linux and macOS only.")
    project = args.project.expanduser().resolve()
    if args.read_repository:
        from upf_knowledge.repository import serve_repository
        return serve_repository(project)
    try:
        configuration = _configuration(project, args.root)
    except ValueError as error:
        return _error("invalid_config", str(error))
    selection = select_store(configuration)
    if isinstance(selection, ConfigError):
        return _error(selection.code, selection.message)
    root = Path(selection.root)
    if not root.exists() or not root.is_dir():
        return _error("unreadable_root", f"Knowledge root is not an existing directory: {root}")
    if not os.access(root, os.R_OK | os.X_OK):
        return _error("unreadable_root", f"Knowledge root is not readable: {root}")
    if args.check:
        print(json.dumps({"ok": True, "root": str(root)}))
        return 0

    if args.verify:
        # External protocol boundary: failures remain a recoverable CLI result.
        try:
            from upf_knowledge.verify import verify_store
            print(json.dumps(verify_store(project, root)))
            return 0
        except Exception:
            return _error("verification_failed", "Knowledge protocol verification failed. Run discovery to populate the store, or reinstall its runtime; then retry --verify.")

    # Load the vendored modules by file path in this process. This avoids resolving
    # same-named modules from an unrelated Python installation.
    vendor = Path(__file__).resolve().parent / "_vendor"
    sys.path.insert(0, str(vendor))
    from upf_knowledge._vendor.mcrt_knowledge_mcp import main as server_main

    return int(server_main([str(root)]))


if __name__ == "__main__":
    raise SystemExit(main())

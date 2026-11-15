import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from upf_knowledge import launcher


class LauncherTests(unittest.TestCase):
    def invoke(self, project: Path, *arguments: str, platform: str = "linux"):
        output = io.StringIO()
        errors = io.StringIO()
        with patch.object(launcher.sys, "platform", platform), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            status = launcher.main(["--project", str(project), *arguments])
        return status, output.getvalue(), errors.getvalue()

    def test_missing_root_returns_structured_error_without_creating_files(self):
        with tempfile.TemporaryDirectory(prefix="project with spaces ") as raw:
            project = Path(raw) / "project folder"
            project.mkdir()
            before = set(project.rglob("*"))
            status, stdout, stderr = self.invoke(project)
            self.assertEqual(status, 2)
            self.assertEqual(json.loads(stderr)["code"], "missing_root")
            self.assertEqual(stdout, "")
            self.assertEqual(set(project.rglob("*")), before)

    def test_conflicting_roots_error(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw) / "project with spaces"
            project.mkdir()
            (project / ".project-knowledge.json").write_text(
                json.dumps({"schemaVersion": 1, "knowledgeRoot": "shared one"}), encoding="utf-8"
            )
            legacy = project / ".monolithic-code-review"
            legacy.mkdir()
            (legacy / "sources.json").write_text(json.dumps({"knowledge": {"root": "shared two"}}), encoding="utf-8")
            status, _, stderr = self.invoke(project)
            self.assertEqual(status, 2)
            self.assertEqual(json.loads(stderr)["code"], "conflicting_roots")

    def test_invalid_config_error(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            (project / ".project-knowledge.json").write_text("{", encoding="utf-8")
            status, _, stderr = self.invoke(project, "--root", "existing")
            self.assertEqual(status, 2)
            self.assertEqual(json.loads(stderr)["code"], "invalid_config")
            self.assertFalse((project / "existing").exists())

    def test_unreadable_root_error(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            root = project / "store with spaces"
            root.mkdir()
            with patch.object(launcher.os, "access", return_value=False):
                status, _, stderr = self.invoke(project, "--root", "store with spaces")
            self.assertEqual(status, 2)
            self.assertEqual(json.loads(stderr)["code"], "unreadable_root")
            self.assertEqual(list(project.iterdir()), [root])

    def test_unsupported_platform_precedes_vendor_import_and_store_creation(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            status, stdout, stderr = self.invoke(project, "--root", "missing", platform="win32")
            self.assertEqual(status, 2)
            self.assertEqual(json.loads(stderr)["code"], "unsupported_platform")
            self.assertEqual(stdout, "")
            self.assertFalse((project / "missing").exists())

    def test_check_resolves_relative_explicit_root_from_project(self):
        with tempfile.TemporaryDirectory(prefix="project with spaces ") as raw:
            project = Path(raw) / "project folder"
            project.mkdir()
            root = project / "knowledge store"
            root.mkdir()
            status, stdout, stderr = self.invoke(project, "--root", "knowledge store", "--check")
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(stdout), {"ok": True, "root": str(root.resolve())})
            self.assertEqual(stderr, "")

    def test_configured_relative_root_is_project_relative(self):
        with tempfile.TemporaryDirectory(prefix="project with spaces ") as raw:
            project = Path(raw) / "project folder"
            project.mkdir()
            root = project / "knowledge store"
            root.mkdir()
            (project / ".project-knowledge.json").write_text(
                json.dumps({"schemaVersion": 1, "knowledgeRoot": "knowledge store"}), encoding="utf-8"
            )
            status, stdout, stderr = self.invoke(project, "--check")
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(stdout)["root"], str(root.resolve()))
            self.assertEqual(stderr, "")


if __name__ == "__main__":
    unittest.main()

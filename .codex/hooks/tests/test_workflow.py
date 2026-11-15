"""Exercise Codex events against the shared workflow implementation."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("workflow", ROOT / ".codex/hooks/workflow.py")
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name)
        shutil.copytree(ROOT / ".claude/hooks", self.project / ".claude/hooks")
        self.git("init", "-q", "-b", "main")
        self.git("-c", "user.email=t@t", "-c", "user.name=test", "commit", "-q", "--allow-empty", "-m", "init")

    def git(self, *args):
        return subprocess.run(("git", "-C", str(self.project), *args), check=True, capture_output=True, text=True)

    def ticket(self):
        return self.git("switch", "-q", "-c", "feature/AGE-1-hooks", "main")

    def event(self, tool, command):
        return {"tool_name": tool, "cwd": str(self.project), "tool_input": {"command": command}}

    def patch(self, body):
        return self.event("apply_patch", f"*** Begin Patch\n{body}\n*** End Patch\n")

    def test_patch_blocked_on_main(self):
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.patch("*** Add File: a.txt\n+x"))[0])

    def test_patch_allowed_on_ticket_branch(self):
        self.ticket()
        self.assertEqual(0, WORKFLOW.run(self.project, "pre", self.patch("*** Add File: a.txt\n+x"))[0])

    def test_every_patch_file_checked(self):
        self.ticket()
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.patch("*** Add File: a.txt\n+x\n*** Add File: docs/new-plan.md\n+x"))[0])

    def test_move_destination_checked(self):
        self.ticket()
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.patch("*** Update File: a.txt\n*** Move to: docs/new-spec.md\n@@\n-x\n+y"))[0])

    def test_delete_checked(self):
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.patch("*** Delete File: a.txt"))[0])

    def test_plan_allowed_under_work_items(self):
        self.ticket()
        self.assertEqual(0, WORKFLOW.run(self.project, "pre", self.patch("*** Add File: docs/work-items/new-plan.md\n+x"))[0])

    def test_tool_cwd_resolves_relative_paths(self):
        self.ticket()
        event = {**self.patch("*** Add File: ../new-plan.md\n+x"), "tool_cwd": str(self.project / "docs/work-items")}
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", event)[0])

    def test_commit_blocked_and_read_only_allowed(self):
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.event("Bash", "git commit -m x"))[0])
        self.assertEqual(0, WORKFLOW.run(self.project, "pre", self.event("Bash", "git status"))[0])

    def test_push_requires_review(self):
        self.ticket()
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.event("Bash", "git push"))[0])
        self.git("config", "branch.feature/AGE-1-hooks.reviewed", self.git("rev-parse", "HEAD").stdout.strip())
        self.assertEqual(0, WORKFLOW.run(self.project, "pre", self.event("Bash", "git push"))[0])

    def test_withdrawn_merge_approval(self):
        self.git("config", "workflow.mergeApproval", "withdrawn")
        self.assertEqual(2, WORKFLOW.run(self.project, "pre", self.event("Bash", "gh pr merge 1"))[0])

    def test_merge_reminder_and_auto_exclusion(self):
        result = WORKFLOW.run(self.project, "post", self.event("Bash", "gh pr merge 1 --squash"))
        self.assertEqual(2, result[0])
        self.assertIn("to Done", result[2])
        self.assertEqual(0, WORKFLOW.run(self.project, "post", self.event("Bash", "gh pr merge 1 --auto"))[0])

    def test_malformed_event_fails_closed(self):
        result = subprocess.run(("python3", str(ROOT / ".codex/hooks/workflow.py"), "pre"), input="{}", text=True, capture_output=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("could not process", result.stderr)

    def test_malformed_patch_rejected(self):
        with self.assertRaises(ValueError):
            WORKFLOW.normalized_events(self.event("apply_patch", "unknown patch"))

    def test_invalid_json_shape_fails_closed(self):
        result = subprocess.run(("python3", str(ROOT / ".codex/hooks/workflow.py"), "pre"), input="[]", text=True, capture_output=True)
        self.assertEqual(2, result.returncode)

    def test_registered_commands_work_from_subdirectory(self):
        config = json.loads((ROOT / ".codex/hooks.json").read_text())
        pre = config["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
        post = config["hooks"]["PostToolUse"][0]["hooks"][0]["command"]
        event = {"tool_name": "Bash", "cwd": str(ROOT), "tool_input": {"command": "git status"}}
        self.assertEqual(0, subprocess.run(pre, shell=True, cwd=ROOT / "docs", input=json.dumps(event), text=True, capture_output=True).returncode)
        result = subprocess.run(post, shell=True, cwd=ROOT / "docs", input=json.dumps({**event, "tool_input": {"command": "gh pr merge 1 --squash"}}), text=True, capture_output=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("to Done", result.stderr)

    def test_registered_command_outside_repository_allows(self):
        config = json.loads((ROOT / ".codex/hooks.json").read_text())
        pre = config["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
        event = {"tool_name": "Bash", "cwd": self.temporary.name, "tool_input": {"command": "git commit -m x"}}
        with tempfile.TemporaryDirectory() as outside:
            result = subprocess.run(pre, shell=True, cwd=outside, input=json.dumps(event), text=True, capture_output=True)
        self.assertEqual(0, result.returncode)


if __name__ == "__main__":
    unittest.main()

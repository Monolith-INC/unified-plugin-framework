"""Unit tests for scripts/dev-hooks/inventory-guard.py (AGE-151)."""

from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

GUARD_PATH = Path(__file__).resolve().parents[1] / "inventory-guard.py"


def _load_guard():
    spec = importlib.util.spec_from_file_location("inventory_guard", GUARD_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class InventoryGuardTests(unittest.TestCase):
    def _init_repo(self, root: Path) -> None:
        subprocess.run(["git", "init", "-b", "main"], cwd=root, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def test_parses_plan_inventory_blocks_outside_and_allows_after_permission(self) -> None:
        guard = _load_guard()
        plan_md = (
            "# Plan\n\n"
            "## File Inventory\n\n"
            "- **Create (1):**\n"
            "  - `src/new_module.ts`\n"
            "- **Modify (1):**\n"
            "  - `src/existing.ts`\n\n"
            "## Notes\n"
            "- `src/not_in_inventory.ts`\n"
        )
        parsed = guard.parse_inventory_from_plan(plan_md)
        self.assertEqual(parsed, ("src/new_module.ts", "src/existing.ts"))

        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()
            self._init_repo(repo)
            plan_file = repo / "plan.md"
            plan_file.write_text(plan_md, encoding="utf-8")

            branch = "feature/AGE-151-discipline"
            # Without an active inventory, check allows
            self.assertEqual(guard.cmd_check(repo, branch, "src/anything.ts"), 0)

            # Register inventory from plan
            self.assertEqual(guard.cmd_set(repo, branch, plan_path=plan_file, files=[]), 0)
            self.assertEqual(guard.cmd_check(repo, branch, "src/new_module.ts"), 0)
            self.assertEqual(guard.cmd_check(repo, branch, "src/existing.ts"), 0)
            self.assertEqual(guard.cmd_check(repo, branch, "AI_Codex/Implementation_Plans/p.md"), 0)
            self.assertEqual(guard.cmd_check(repo, branch, "docs/work-items/p.md"), 0)

            # Out-of-scope file is blocked with exit code 2
            self.assertEqual(guard.cmd_check(repo, branch, "src/not_in_inventory.ts"), 2)

            # Other branch is unaffected
            self.assertEqual(guard.cmd_check(repo, "feature/AGE-999-other", "src/not_in_inventory.ts"), 0)

            # Amending after user permission unblocks the file
            self.assertEqual(guard.cmd_allow(repo, branch, ["src/not_in_inventory.ts"]), 0)
            self.assertEqual(guard.cmd_check(repo, branch, "src/not_in_inventory.ts"), 0)

            # Clearing restores open state
            self.assertEqual(guard.cmd_clear(repo, branch), 0)
            self.assertEqual(guard.cmd_check(repo, branch, "src/another.ts"), 0)


if __name__ == "__main__":
    unittest.main()

"""Ticket flow against disposable Git repositories and stub host boundaries."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "ticket-flow.py"
A = "feature/AGE-1-first"
B = "feature/AGE-2-next"


class TicketFlowTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.remote = self.root / "remote"
        self.writer = self.root / "writer"
        self.repo = self.root / "project"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.pr = self.root / "pr.json"
        self.open_prs = self.root / "open.json"
        self.open_prs.write_text("[]")
        self.stub("gh", """#!/usr/bin/env python3
import os, sys
from pathlib import Path
key = 'FIXTURE_PR' if sys.argv[2] == 'view' or 'merged' in sys.argv else 'FIXTURE_OPEN'
path = Path(os.environ[key])
print(path.read_text() if path.exists() else '[]')
""")
        self.stub("harness", """#!/usr/bin/env python3
import os, sys
from pathlib import Path
if sys.argv[1:] == ['session', 'status']:
    print("HS-ABC: AGE-1 on feature/AGE-1-first (active)")
else:
    Path(os.environ['FIXTURE_SESSION']).write_text("closed")
""")
        self.env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
                    "PATH": f"{self.bin}:{os.environ['PATH']}",
                    "FIXTURE_PR": str(self.pr), "FIXTURE_OPEN": str(self.open_prs),
                    "FIXTURE_SESSION": str(self.root / "session")}
        self.git(self.root, "init", "-q", "--bare", "-b", "main", str(self.remote))
        self.git(self.root, "init", "-q", "-b", "main", str(self.writer))
        self.commit(self.writer, "initial")
        self.git(self.writer, "push", "-q", str(self.remote), "main")
        self.git(self.root, "clone", "-q", str(self.remote), str(self.repo))

    def stub(self, name, source):
        path = self.bin / name
        path.write_text(source)
        path.chmod(0o755)

    def git(self, cwd, *args):
        command = ("git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", *args)
        return subprocess.run(command, cwd=cwd, env=self.env, check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, cwd, message):
        self.git(cwd, "commit", "-q", "--allow-empty", "-m", message)
        return self.git(cwd, "rev-parse", "HEAD")

    def flow(self, *args, cwd=None, code=0):
        result = subprocess.run((sys.executable, "-B", str(SCRIPT), *args), cwd=cwd or self.repo,
                                env=self.env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, code, result.stderr or result.stdout)
        return result.stdout + result.stderr

    def record_pr(self, state, head, merge, *, base="main"):
        self.pr.write_text(json.dumps({
            "state": state, "baseRefName": base, "headRefName": A,
            "headRefOid": head, "isCrossRepository": False, "mergeCommit": {"oid": merge},
        }))

    def test_start_pulls_latest_main_and_refuses_another_worktree(self):
        updated = self.commit(self.writer, "remote update")
        self.git(self.writer, "push", "-q", str(self.remote), "main")
        self.flow("start", A)
        self.assertEqual(self.git(self.repo, "rev-parse", A), updated)
        other = self.root / "second checkout"
        self.git(self.repo, "worktree", "add", "-q", str(other), "main")
        self.assertIn(A, self.flow("start", B, cwd=other, code=2))

    def test_start_preserves_open_pr_local_commits_and_dirty_main(self):
        self.open_prs.write_text(json.dumps([{"headRefName": A, "url": "https://example.invalid/pull/8"}]))
        self.assertIn("/pull/8", self.flow("start", B, code=2))
        self.open_prs.write_text("[]")
        file = self.repo / "local.txt"
        file.write_text("preserve")
        self.assertIn("uncommitted", self.flow("start", B, code=2))
        self.assertEqual(file.read_text(), "preserve")
        self.git(self.repo, "add", "local.txt")
        tip = self.commit(self.repo, "local only")
        self.assertIn("unpushed", self.flow("start", B, code=2))
        self.assertEqual(self.git(self.repo, "rev-parse", "HEAD"), tip)

    def test_unfinished_legacy_branch_can_be_resumed(self):
        self.git(self.repo, "switch", "-c", A)
        self.commit(self.repo, "unfinished")
        self.git(self.repo, "switch", "main")
        self.assertIn(A, self.flow("start", B, code=2))
        self.git(self.repo, "switch", A)
        self.assertIn(A, self.flow("resume"))

    def test_start_resumes_existing_remote_branch_instead_of_replacing_its_base(self):
        self.git(self.writer, "switch", "-c", A)
        self.commit(self.writer, "remote work")
        self.git(self.writer, "push", "-q", str(self.remote), A)
        self.assertIn("already exists on origin", self.flow("start", A, code=2))
        self.assertEqual(self.git(self.repo, "branch", "--show-current"), "main")

    def test_only_a_verified_current_tip_can_close_out_and_start_next(self):
        (self.repo / ".harness").mkdir()
        (self.repo / ".harness" / "settings.json").write_text("{}")
        self.git(self.repo, "add", "-f", ".harness/settings.json")
        self.commit(self.repo, "enable harness fixture")
        self.git(self.repo, "push", "-q", "origin", "main")
        self.git(self.writer, "pull", "-q", "--ff-only", str(self.remote), "main")
        self.flow("start", A)
        tip = self.commit(self.repo, "ticket implementation")
        merge = self.commit(self.writer, "squash result")
        self.record_pr("OPEN", tip, merge)
        self.assertIn("must be merged", self.flow("closeout", "7", code=2))
        self.record_pr("MERGED", merge, merge)
        self.assertIn("current tip", self.flow("closeout", "7", code=2))
        self.record_pr("MERGED", tip, merge, base="other")
        self.assertIn("must be merged", self.flow("closeout", "7", code=2))
        self.record_pr("MERGED", tip, merge)
        self.assertIn("missing from refreshed main", self.flow("closeout", "7", code=2))
        self.assertIn(A, self.flow("start", B, code=2))
        self.git(self.writer, "push", "-q", str(self.remote), "main")
        self.assertIn("Mark AGE-1 Done", self.flow("closeout", "7"))
        self.assertEqual(self.git(self.repo, "branch", "--show-current"), "main")
        self.assertEqual(self.git(self.repo, "rev-parse", "HEAD"), merge)
        self.assertIn(A, self.flow("start", B, code=2))
        self.flow("finish", "--done", "AGE-2", code=2)
        self.assertIn("next ticket", self.flow("finish", "--done", "AGE-1"))
        self.assertEqual((self.root / "session").read_text(), "closed")
        self.assertEqual(self.git(self.repo, "branch", "--show-current"), "main")
        self.pr.write_text(f"[{self.pr.read_text()}]")
        self.flow("start", B)
        self.assertEqual(self.git(self.repo, "rev-parse", A), tip)

    def test_linked_worktree_refreshes_main_and_closes_its_own_session(self):
        self.flow("start", A)
        main_checkout = self.root / "main checkout"
        self.git(self.repo, "worktree", "add", "-q", str(main_checkout), "main")
        self.git(self.repo, "config", "--local", "core.excludesFile", str(self.root / "ignore"))
        (self.root / "ignore").write_text(".harness/\n")
        (self.repo / ".harness").mkdir()
        (self.repo / ".harness" / "settings.json").write_text("{}")
        tip = self.commit(self.repo, "ticket implementation")
        merge = self.commit(self.writer, "squash result")
        self.git(self.writer, "push", "-q", str(self.remote), "main")
        self.record_pr("MERGED", tip, merge)
        self.assertIn(str(main_checkout), self.flow("closeout", "7"))
        self.assertEqual(self.git(main_checkout, "rev-parse", "HEAD"), merge)
        self.assertEqual(self.git(self.repo, "branch", "--show-current"), A)
        self.assertIn(str(main_checkout), self.flow("finish", "--done", "AGE-1", cwd=main_checkout))
        self.assertEqual((self.root / "session").read_text(), "closed")
        self.assertEqual(self.git(main_checkout, "branch", "--show-current"), "main")

    def test_merge_guard_accepts_only_the_active_branch(self):
        self.flow("start", A)
        self.record_pr("OPEN", self.git(self.repo, "rev-parse", A), "")
        self.flow("guard-merge", "7")
        self.record_pr("OPEN", self.git(self.repo, "rev-parse", A), "", base="other")
        self.assertIn(A, self.flow("guard-merge", "8", code=2))
        self.assertIn("PR number", self.flow("guard-merge", code=2))

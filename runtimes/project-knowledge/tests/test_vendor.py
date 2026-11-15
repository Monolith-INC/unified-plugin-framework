import hashlib
import json
import unittest
import zipfile
from pathlib import Path

from tests.installed_runtime import installed_runtime


ROOT = Path(__file__).parents[1]
VENDOR = ROOT / "vendor" / "review-knowledge"
PIN = "3af148b44421521bb453be0abea05750e45f6f8a"


class VendorTests(unittest.TestCase):
    def test_pinned_bytes(self):
        provenance = json.loads((VENDOR / "provenance.json").read_text())
        self.assertEqual(provenance["commit"], PIN)
        self.assertEqual(
            provenance["repository"],
            "https://github.com/Monolith-INC/monolithic-code-review-toolkit",
        )
        self.assertTrue(provenance["files"])
        for relative_path, expected_digest in provenance["files"].items():
            with self.subTest(path=relative_path):
                actual_digest = hashlib.sha256((VENDOR / relative_path).read_bytes()).hexdigest()
                self.assertEqual(actual_digest, expected_digest)

    def test_required_license(self):
        self.assertTrue((VENDOR / "LICENSE").is_file())
        self.assertIn(b"MIT License", (VENDOR / "LICENSE").read_bytes())

    def test_wheel_contains_runtime(self):
        _, _, wheel_path = installed_runtime()
        with zipfile.ZipFile(wheel_path) as wheel:
            names = set(wheel.namelist())
        self.assertIn("upf_knowledge/__init__.py", names)
        self.assertIn("upf_knowledge/_vendor/knowledge_store.py", names)
        self.assertIn("upf_knowledge/_vendor/mcrt_knowledge_mcp.py", names)
        self.assertIn("upf_knowledge/_vendor/LICENSE", names)


if __name__ == "__main__":
    unittest.main()

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLUGIN = ROOT / "plugins" / "project-knowledge"


class SkillPackagingTests(unittest.TestCase):
    def test_skills_have_frontmatter_name_and_description(self):
        for skill in ("discover-project-knowledge", "setup-project-knowledge"):
            content = (PLUGIN / "skills" / skill / "SKILL.md").read_text()
            match = re.match(r"\A---\n(.*?)\n---\n", content, re.S)
            self.assertIsNotNone(match, skill)
            self.assertRegex(match.group(1), r"(?m)^name:\s*\S+")
            self.assertRegex(match.group(1), r"(?m)^description:\s*.+")

    def test_portable_manifest_has_plugin_identity(self):
        manifest = json.loads((PLUGIN / "plugin.json").read_text())
        self.assertEqual(manifest["name"], "project-knowledge")
        self.assertEqual(manifest["version"], "0.1.0")

    def test_discovery_uses_independent_configuration(self):
        skill = (PLUGIN / "skills" / "discover-project-knowledge" / "SKILL.md").read_text()
        self.assertIn(".project-knowledge.json", skill)
        self.assertIn("knowledgeRoot", skill)
        self.assertNotIn("review-setup", skill)
        self.assertIn("knowledge_catalog", skill)
        self.assertIn("knowledge_find", skill)
        self.assertIn("knowledge_fetch", skill)

    def test_setup_explains_document_relationship_and_conflict_resolution(self):
        skill = (PLUGIN / "skills" / "setup-project-knowledge" / "SKILL.md").read_text()
        self.assertIn("existing `documentMode`", skill)
        self.assertIn("share one set of original documents", skill)
        self.assertIn("knowledgeRoot` independent", skill)
        self.assertIn("select the legacy root", skill)
        self.assertIn("recheck both settings", skill)

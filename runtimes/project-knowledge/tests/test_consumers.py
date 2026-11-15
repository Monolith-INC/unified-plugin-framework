"""Two independent clients use one persistent project knowledge root."""

import asyncio
from pathlib import Path
import re
import tempfile
import unittest

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from tests.installed_runtime import installed_runtime


class SharedConsumerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _, cls.executable, _ = installed_runtime()

    def test_independent_clients_share_one_persistent_unit(self):
        async def client(project: Path, operation):
            parameters = StdioServerParameters(
                command=str(self.executable), args=["--project", str(project)]
            )
            async with stdio_client(parameters) as (reader, writer):
                async with ClientSession(reader, writer) as session:
                    await asyncio.wait_for(session.initialize(), timeout=15)

                    async def call(name, arguments):
                        result = await asyncio.wait_for(session.call_tool(name, arguments), timeout=15)
                        return "\n".join(item.text for item in result.content if hasattr(item, "text"))

                    return await operation(call)

        def policy(body):
            return (
                "---\n"
                "id: 4-rules/review-policy\n"
                "tier: 4\n"
                "type: rules\n"
                "area: review\n"
                "title: Review policy\n"
                "read_when: reviewing project changes\n"
                "provenance: observed\n"
                "sources: [docs/review-policy.md]\n"
                "status: current\n"
                "---\n\n"
                f"{body}\n"
            )

        with tempfile.TemporaryDirectory(prefix="upf-knowledge-consumers-") as raw:
            project = Path(raw) / "project"
            root = project / "shared"
            project.mkdir()
            root.mkdir()
            (project / ".project-knowledge.json").write_text(
                '{"schemaVersion":1,"knowledgeRoot":"shared"}', encoding="utf-8"
            )
            (project / "docs").mkdir()
            (project / "docs/review-policy.md").write_text("Source for review policy.\n", encoding="utf-8")

            async def write(call):
                return await call("knowledge_put", {
                    "id": "4-rules/review-policy",
                    "content": policy("Require a source-backed review decision."),
                    "if_version": "new",
                })

            asyncio.run(client(project, write))  # Consumer A: Continuity-style writer.

            async def review(call):
                found = await call("knowledge_find", {"terms": "review-policy"})
                self.assertIn("4-rules/review-policy", found)
                fetched = await call("knowledge_fetch", {"id": "4-rules/review-policy"})
                self.assertIn("docs/review-policy.md", fetched)
                version = re.search(r"version `([^`]+)`", fetched)
                self.assertIsNotNone(version, fetched)
                updated = await call("knowledge_put", {
                    "id": "4-rules/review-policy",
                    "content": policy("Require a source-backed review decision and record the outcome."),
                    "if_version": version.group(1),
                })
                self.assertIn("Wrote", updated)

            asyncio.run(client(project, review))  # Consumer B: review-style reader/updater.

            async def confirm(call):
                fetched = await call("knowledge_fetch", {"id": "4-rules/review-policy"})
                self.assertIn("record the outcome", fetched)

            asyncio.run(client(project, confirm))  # Consumer A sees the persisted update after restart.
            units = list(root.rglob("*.md"))
            self.assertEqual(len(units), 1, units)
            self.assertFalse((project / ".monolithic-code-review/knowledge").exists())
            self.assertFalse((project / "knowledge").exists())

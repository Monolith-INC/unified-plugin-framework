"""End-to-end protocol coverage against the built and installed wheel."""

import asyncio
import json
from pathlib import Path
import re
import tempfile
import subprocess
import unittest

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from tests.installed_runtime import installed_runtime


class InstalledTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _, cls.executable, _ = installed_runtime()

    def test_verify_checks_real_catalog_search_and_fetch(self):
        with tempfile.TemporaryDirectory(prefix="upf knowledge verify ") as raw:
            project = Path(raw)
            knowledge = project / "knowledge"
            (knowledge / "4-rules").mkdir(parents=True)
            (project / ".project-knowledge.json").write_text(json.dumps({"schemaVersion": 1, "knowledgeRoot": "knowledge"}))
            (knowledge / "4-rules/testing.md").write_text(
                "---\nid: 4-rules/testing\ntier: 4\ntype: rules\narea: testing\ntitle: Testing\n"
                "read_when: choosing verification\nprovenance: stated\nsources: [AGENTS.md]\nstatus: current\n---\n"
                "## Summary\nTesting uses focused checks.\n")
            (knowledge / "catalog.tsv").write_text(
                "id\ttype\tarea\ttitle\tpath\tprovenance\tupdated\tread_when\n"
                "4-rules/testing\trules\ttesting\tTesting\t4-rules/testing.md\tstated\t2026-11-17\tchoosing verification\n")
            result = subprocess.run([str(self.executable), "--project", str(project), "--verify"], capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["verified"], ["catalog", "find", "fetch"])
            (knowledge / "catalog.tsv").write_text("id\ttype\n")
            failed = subprocess.run([str(self.executable), "--project", str(project), "--verify"], capture_output=True, text=True, timeout=60)
            self.assertEqual(failed.returncode, 2)
            self.assertEqual(json.loads(failed.stderr)["code"], "verification_failed")

    def test_server_protocol_contract(self):
        async def exercise(project: Path):
            parameters = StdioServerParameters(
                command=str(self.executable), args=["--project", str(project)]
            )
            async with stdio_client(parameters) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await asyncio.wait_for(session.initialize(), timeout=10)
                    tools = await asyncio.wait_for(session.list_tools(), timeout=10)
                    self.assertEqual(
                        {tool.name for tool in tools.tools},
                        {"knowledge_catalog", "knowledge_find", "knowledge_fetch", "knowledge_links",
                         "knowledge_put", "knowledge_patch", "knowledge_add"},
                    )

                    def unit(unit_id: str, provenance: str, body: str) -> str:
                        return (
                            "---\n"
                            f"id: {unit_id}\n"
                            "tier: 4\n"
                            "type: rules\n"
                            "area: testing\n"
                            f"title: {unit_id}\n"
                            "read_when: testing the project knowledge server\n"
                            f"provenance: {provenance}\n"
                            "sources: [human]\n"
                            "status: current\n"
                            "---\n\n"
                            f"{body}\n"
                        )

                    async def call(name: str, arguments: dict[str, object]) -> str:
                        response = await asyncio.wait_for(session.call_tool(name, arguments), timeout=10)
                        return "\n".join(item.text for item in response.content if hasattr(item, "text"))

                    await call("knowledge_put", {
                        "id": "4-rules/concurrency", "content": unit("4-rules/concurrency", "stated", "initial"),
                        "if_version": "new",
                    })
                    fetched = await call("knowledge_fetch", {"id": "4-rules/concurrency"})
                    token = re.search(r"version `([^`]+)`", fetched)
                    self.assertIsNotNone(token, fetched)
                    version = token.group(1)
                    updates = await asyncio.gather(
                        call("knowledge_put", {"id": "4-rules/concurrency", "content": unit("4-rules/concurrency", "stated", "winner one"), "if_version": version}),
                        call("knowledge_put", {"id": "4-rules/concurrency", "content": unit("4-rules/concurrency", "stated", "winner two"), "if_version": version}),
                    )
                    self.assertEqual(sum("Wrote" in update for update in updates), 1, updates)
                    self.assertEqual(sum("version_conflict" in update for update in updates), 1, updates)
                    winner = await call("knowledge_fetch", {"id": "4-rules/concurrency"})
                    self.assertTrue("winner one" in winner or "winner two" in winner, winner)

                    long_content = " ".join(f"segment{i:03}" for i in range(240))
                    await call("knowledge_put", {
                        "id": "4-rules/long", "content": unit("4-rules/long", "stated", long_content),
                        "if_version": "new",
                    })
                    truncated = await call("knowledge_fetch", {"id": "4-rules/long", "max_tokens": 50})
                    self.assertIn("truncated", truncated.lower())
                    self.assertIn("start_line=", truncated)

                    await call("knowledge_put", {
                        "id": "4-rules/assumed", "content": unit("4-rules/assumed", "assumed", "tentative detail"),
                        "if_version": "new",
                    })
                    assumed = await call("knowledge_fetch", {"id": "4-rules/assumed"})
                    self.assertIn("assumed", assumed)
                    self.assertIn("INCONCLUSIVE", assumed)

        with tempfile.TemporaryDirectory(prefix="project knowledge protocol ") as raw:
            project = Path(raw) / "target project"
            project.mkdir()
            (project / "shared knowledge").mkdir()
            (project / ".project-knowledge.json").write_text(
                '{"schemaVersion":1,"knowledgeRoot":"shared knowledge"}', encoding="utf-8"
            )
            asyncio.run(exercise(project))


if __name__ == "__main__":
    unittest.main()

"""Protocol verification at the installed runtime boundary; no model conversation."""
from __future__ import annotations

import asyncio
import csv
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TOOLS = frozenset({"knowledge_catalog", "knowledge_find", "knowledge_fetch", "knowledge_links",
                   "knowledge_put", "knowledge_patch", "knowledge_add"})


def _text(response: object) -> str:
    return "\n".join(item.text for item in getattr(response, "content", ()) if hasattr(item, "text"))


async def _read(session: ClientSession, name: str, arguments: dict[str, object]) -> str:
    response = await asyncio.wait_for(session.call_tool(name, arguments), timeout=15)
    content = _text(response)
    match bool(getattr(response, "is_error", False)) or content.startswith("Error"):
        case True:
            raise ValueError(f"{name} did not return usable knowledge. Rebuild the catalog and retry verification.")
        case False:
            return content


async def _verify(project: Path, root: Path, unit: str) -> dict[str, object]:
    parameters = StdioServerParameters(command=sys.executable,
        args=["-m", "upf_knowledge.launcher", "--project", str(project), "--root", str(root)])
    async with stdio_client(parameters) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await asyncio.wait_for(session.initialize(), timeout=15)
            tools = await asyncio.wait_for(session.list_tools(), timeout=15)
            match frozenset(tool.name for tool in tools.tools) == TOOLS:
                case False:
                    raise ValueError("Knowledge tools differ from the supported runtime; reinstall the project runtime.")
                case True:
                    catalog = await _read(session, "knowledge_catalog", {})
                    found = await _read(session, "knowledge_find", {"terms": unit.rsplit("/", 1)[-1]})
                    fetched = await _read(session, "knowledge_fetch", {"id": unit})
                    match unit in catalog and unit in found and "version" in fetched:
                        case False:
                            raise ValueError("Catalog, search and fetch disagree; refresh project knowledge and retry.")
                        case True:
                            return {"ok": True, "root_unit": unit, "tools": sorted(TOOLS),
                                    "verified": ["catalog", "find", "fetch"]}


def verify_store(project: Path, root: Path) -> dict[str, object]:
    """Read one real indexed unit over a fresh installed MCP process."""
    with (root / "catalog.tsv").open(encoding="utf-8", newline="") as stream:
        units = tuple(csv.DictReader(stream, delimiter="\t"))
    match units:
        case ():
            raise ValueError("Knowledge is empty. Run discover-project-knowledge before verifying the server.")
        case (first, *_):
            return asyncio.run(_verify(project, root, first["id"]))

from pathlib import Path
import shutil

from setuptools import setup
from setuptools.command.build_py import build_py


ROOT = Path(__file__).parent
VENDOR = ROOT / "vendor" / "review-knowledge"


class BuildPyWithVendor(build_py):
    def run(self):
        super().run()
        target = Path(self.build_lib) / "upf_knowledge" / "_vendor"
        target.mkdir(parents=True, exist_ok=True)
        for source, name in (
            (VENDOR / "adapters/knowledge/knowledge_store.py", "knowledge_store.py"),
            (VENDOR / "adapters/knowledge/mcrt_knowledge_mcp.py", "mcrt_knowledge_mcp.py"),
        ):
            shutil.copyfile(source, target / name)
        for source, name in (
            (VENDOR / "LICENSE", "LICENSE"),
            (VENDOR / "provenance.json", "provenance.json"),
        ):
            shutil.copyfile(source, target / name)
        (target / "__init__.py").write_text('"""Pinned upstream runtime modules."""\n')


setup(cmdclass={"build_py": BuildPyWithVendor})

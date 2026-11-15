"""Build and install the runtime wheel once for installed-package tests."""

from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import atexit


RUNTIME = Path(__file__).parents[1]
_resources = None


def installed_runtime():
    global _resources
    if _resources is not None:
        return _resources

    resources = tempfile.TemporaryDirectory(prefix="upf-knowledge-installed-")
    root = Path(resources.name)
    source = root / "source"
    wheel_dir = root / "wheel"
    wheel_dir.mkdir()
    shutil.copytree(
        RUNTIME,
        source,
        ignore=shutil.ignore_patterns("build", "dist", "*.egg-info", "__pycache__", "*.pyc", ".pytest_cache"),
    )
    python = Path(sys.executable)
    subprocess.run(
        [str(python), "-m", "pip", "wheel", "--no-deps", "--no-build-isolation", "--wheel-dir", str(wheel_dir), str(source)],
        check=True, capture_output=True, text=True, timeout=120,
    )
    wheel = next(wheel_dir.glob("upf_project_knowledge-*.whl"))
    subprocess.run(
        [str(python), "-m", "pip", "install", "--no-deps", "--force-reinstall", str(wheel)],
        check=True, capture_output=True, text=True, timeout=120,
    )
    executable = Path(sys.prefix) / ("Scripts/upf-project-knowledge.exe" if sys.platform == "win32" else "bin/upf-project-knowledge")
    atexit.register(resources.cleanup)
    _resources = (resources, executable, wheel)
    return _resources

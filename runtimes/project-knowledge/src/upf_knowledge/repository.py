"""Read-only repository access for unattended knowledge discovery."""

from contextlib import ExitStack, contextmanager
import os
from pathlib import Path
import stat

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError


def _visible(name: str) -> bool:
    return bool(name) and not name.startswith(".") and name not in {"node_modules", "__pycache__"}


@contextmanager
def _open(root: Path, path: str, flags: int):
    parts = path.split("/") if path else []
    if not all(map(_visible, parts)):
        raise ToolError("Use a visible path relative to the repository root.")
    # Resolve each component through its open parent, so a replaced directory
    # or symbolic link cannot redirect an already checked path.
    try:
        with ExitStack() as stack:
            descriptor = os.open(root, os.O_DIRECTORY | os.O_NOFOLLOW)
            stack.callback(os.close, descriptor)
            for index, part in enumerate(parts):
                mode = flags if index == len(parts) - 1 else os.O_DIRECTORY
                descriptor = os.open(part, mode | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
                stack.callback(os.close, descriptor)
            yield descriptor
    except OSError:
        raise ToolError("The path was not readable without following symbolic links.") from None


def serve_repository(root: Path) -> int:
    server = MCPServer("project-repository")

    @server.tool()
    def repository_list(path: str = "", offset: int = 0) -> list[str]:
        """List up to 200 visible files or directories under a repository-relative path."""
        if offset < 0:
            raise ToolError("Offset must be nonnegative.")
        with _open(root, path, os.O_DIRECTORY) as directory:
            return sorted(filter(_visible, os.listdir(directory)))[offset:offset + 200]

    @server.tool()
    def repository_read(path: str, offset: int = 0) -> str:
        """Read up to 24 KiB of text from a repository-relative path at a byte offset."""
        if not path or offset < 0:
            raise ToolError("A file path and nonnegative offset are required.")
        with _open(root, path, os.O_RDONLY) as handle:
            status = os.fstat(handle)
            if not stat.S_ISREG(status.st_mode) or status.st_nlink != 1:
                raise ToolError("Only regular repository files with one link are readable.")
            return os.pread(handle, 24 * 1024, offset).decode("utf-8", errors="replace")

    server.run(transport="stdio")
    return 0

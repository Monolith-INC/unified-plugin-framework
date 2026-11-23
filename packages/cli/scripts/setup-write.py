"""Atomic installer file updates with an OS-owned lease."""

import errno
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import sys
import runpy
from contextlib import ExitStack
from uuid import uuid4

if os.name == "nt":
    windows = runpy.run_path(str(Path(__file__).with_name("setup-write-windows.py")))
    print(windows["main"]())
    sys.exit(0)

import fcntl


def parent_fd(stack: ExitStack, root: Path, parents: tuple[str, ...], create: bool = True) -> int:
    flags = os.O_DIRECTORY | os.O_NOFOLLOW
    handle = os.open(root, flags)
    stack.callback(os.close, handle)
    for part in parents:
        if create:
            try:
                os.mkdir(part, dir_fd=handle)
            except FileExistsError:
                pass
        handle = os.open(part, flags, dir_fd=handle)
        stack.callback(os.close, handle)
    return handle


def read_text(parent: int, name: str) -> str | None:
    try:
        handle = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    except FileNotFoundError:
        return None
    with os.fdopen(handle, "r", encoding="utf-8", newline="") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise OSError(errno.ELOOP, "Not a regular file.")
        return stream.read()


def read_confined(root: Path, path: Path) -> str:
    target = path.relative_to(root)
    if not target.parts or ".." in target.parts:
        return "symlink-escape"
    try:
        with ExitStack() as stack:
            parent = parent_fd(stack, root, target.parts[:-1], create=False)
            return json.dumps({"content": read_text(parent, target.name)})
    except FileNotFoundError:
        return json.dumps({"content": None})


def lease_directory(stack: ExitStack, root: Path) -> int:
    tools = parent_fd(stack, root, (".upf-tools",))
    try:
        os.mkdir("write-locks", mode=0o700, dir_fd=tools)
    except FileExistsError:
        pass
    handle = os.open("write-locks", os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=tools)
    stack.callback(os.close, handle)
    info = os.fstat(handle)
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise PermissionError(errno.EACCES, "Write locks need a private directory.")
    return handle


def remember(lease: int, target: Path, temporary: str, handle: int, kind: str = "file") -> None:
    info = os.fstat(handle)
    record = json.dumps({"kind": kind, "target": str(target), "name": temporary, "device": info.st_dev, "inode": info.st_ino}).encode()
    os.ftruncate(lease, 0)
    os.pwrite(lease, record, 0)
    os.fsync(lease)


def recover_temporary(lease: int, parent: int, name: str) -> None:
    try:
        record = json.loads(os.pread(lease, 8192, 0))
        temporary = record["name"]
        if not re.fullmatch(rf"{re.escape(name)}\.upf-[0-9a-f]{{32}}\.tmp", temporary):
            return
        info = os.stat(temporary, dir_fd=parent, follow_symlinks=False)
        if stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == (record["device"], record["inode"]):
            os.unlink(temporary, dir_fd=parent)
    except (ValueError, TypeError, KeyError, FileNotFoundError):
        return


def replace(lease: int, parent: int, target: Path, content: str, mode: int | None = None) -> str:
    name = target.name
    temporary = f"{name}.upf-{uuid4().hex}.tmp"
    handle = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=parent)
    try:
        if mode is not None:
            os.fchmod(handle, mode)
        with os.fdopen(handle, "wb") as writer:
            remember(lease, target, temporary, writer.fileno())
            writer.write(content.encode("utf-8"))
            writer.flush()
            os.fsync(writer.fileno())
        os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
        os.ftruncate(lease, 0)
        return "written"
    finally:
        try:
            os.unlink(temporary, dir_fd=parent)
        except FileNotFoundError:
            pass


def lock_key(target: Path) -> str:
    return sha256(os.fsencode(str(target))).hexdigest()


def take_lease(stack: ExitStack, leases: int, key: str, create: bool) -> int:
    flags = os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK
    lease = os.open(key, flags | (os.O_CREAT if create else 0), 0o600, dir_fd=leases)
    stack.callback(os.close, lease)
    info = os.fstat(lease)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise OSError(errno.ELOOP, "Unsafe write lock.")
    fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return lease


def update(root: Path, path: Path, content: str, previous: str | None, preserve_mode: bool = False) -> str:
    target = path.relative_to(root)
    parts = target.parts
    if not parts or ".." in parts:
        return "symlink-escape"
    with ExitStack() as stack:
        leases = lease_directory(stack, root)
        parent = parent_fd(stack, root, parts[:-1])
        name = parts[-1]
        # Keep the inode stable so competing writers always lock the same file.
        lease = take_lease(stack, leases, lock_key(target), create=True)
        try:
            os.stat(f"{name}.upf.lock", dir_fd=parent, follow_symlinks=False)
            return "write-busy"
        except FileNotFoundError:
            recover_temporary(lease, parent, name)
            current = read_text(parent, name)
            if current != previous:
                return "modified-file"
            mode = stat.S_IMODE(os.stat(name, dir_fd=parent, follow_symlinks=False).st_mode) if preserve_mode and current is not None else None
            return replace(lease, parent, target, content, mode)


def sweep_entry(root: Path, leases: int, key: str) -> None:
    try:
        with ExitStack() as stack:
            lease = take_lease(stack, leases, key, create=False)
            record = json.loads(os.pread(lease, 8192, 0))
            target = Path(record["target"])
            if target.is_absolute() or not target.parts or ".." in target.parts or lock_key(target) != key:
                return
            parent = parent_fd(stack, root, target.parts[:-1], create=False)
            if record.get("kind") == "stage":
                quarantine(parent, target, record)
            else:
                recover_temporary(lease, parent, target.name)
            os.ftruncate(lease, 0)
    except (ValueError, KeyError, TypeError, FileNotFoundError, BlockingIOError):
        return


def sweep(root: Path) -> str:
    with ExitStack() as stack:
        try:
            leases = parent_fd(stack, root, (".upf-tools", "write-locks"), create=False)
        except FileNotFoundError:
            return "written"
        info = os.fstat(leases)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            return "write-denied"
        for key in filter(lambda name: re.fullmatch(r"[0-9a-f]{64}", name), os.listdir(leases)):
            sweep_entry(root, leases, key)
        return "written"


def quarantine(parent: int, target: Path, record: dict) -> None:
    if target.parts[:-1] != (".upf-tools", "staging") or not re.fullmatch(r"stage-[0-9a-f]{32}", target.name):
        return
    try:
        info = os.stat(target.name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return
    if stat.S_ISDIR(info.st_mode) and (info.st_dev, info.st_ino) == (record["device"], record["inode"]):
        os.rename(target.name, f"recovered-{uuid4().hex}", src_dir_fd=parent, dst_dir_fd=parent)


def stage(root: Path) -> str:
    target = Path(".upf-tools", "staging", f"stage-{uuid4().hex}")
    with ExitStack() as stack:
        leases = lease_directory(stack, root)
        parent = parent_fd(stack, root, target.parts[:-1])
        lease = take_lease(stack, leases, lock_key(target), create=True)
        os.mkdir(target.name, mode=0o700, dir_fd=parent)
        handle = os.open(target.name, os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        stack.callback(os.close, handle)
        remember(lease, target, target.name, handle, "stage")
        print(target.name, flush=True)
        sys.stdin.buffer.read(1)
        quarantine(parent, target, json.loads(os.pread(lease, 8192, 0)))
        os.ftruncate(lease, 0)
        return "written"


def main() -> str:
    root, path = map(Path, sys.argv[1:3])
    try:
        if len(sys.argv) == 4 and sys.argv[3] == "--read":
            return read_confined(root, path)
        if str(path) == "--sweep":
            return sweep(root)
        if str(path) == "--stage":
            return stage(root)
        request = json.load(sys.stdin)
        return update(root, path, request["content"], request["previous"], request.get("preserveMode", False))
    except ValueError:
        return "symlink-escape"
    except OSError as error:
        return {
            errno.EAGAIN: "write-busy", errno.EBUSY: "write-busy",
            errno.EACCES: "write-denied", errno.EPERM: "write-denied", errno.EROFS: "write-denied",
            errno.ELOOP: "symlink-escape", errno.ENOTDIR: "symlink-escape",
        }.get(error.errno, "tooling-storage")


if __name__ == "__main__":
    print(main())

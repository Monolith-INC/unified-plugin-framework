"""Windows setup I/O, using pinned, non-reparse directory handles."""

import ctypes
from ctypes import wintypes
from contextlib import ExitStack
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys
from uuid import uuid4

kernel = ctypes.WinDLL("kernel32", use_last_error=True)
security = ctypes.WinDLL("advapi32", use_last_error=True)
HANDLE = wintypes.HANDLE
DWORD = wintypes.DWORD
INVALID = ctypes.c_void_p(-1).value
READ = 0x80000000
WRITE = 0x40000000
DELETE = 0x00010000
READ_ATTRIBUTES = 0x80
ADD_FILE = 0x2
READ_CONTROL = 0x00020000
WRITE_DAC = 0x00040000
SHARE_READ_WRITE = 0x3
OPEN_EXISTING = 3
OPEN_ALWAYS = 4
CREATE_NEW = 1
BACKUP_SEMANTICS = 0x02000000
OPEN_REPARSE = 0x00200000
REPARSE = 0x400
DIRECTORY = 0x10
FILE_TYPE_DISK = 1
MAX_BYTES = 4 * 1024 * 1024

kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, DWORD, DWORD, ctypes.c_void_p, DWORD, DWORD, HANDLE]
kernel.CreateFileW.restype = HANDLE
kernel.CloseHandle.argtypes = [HANDLE]
kernel.CloseHandle.restype = wintypes.BOOL
kernel.GetFileType.argtypes = [HANDLE]
kernel.GetFileType.restype = DWORD
kernel.GetFileInformationByHandle.argtypes = [HANDLE, ctypes.c_void_p]
kernel.GetFileInformationByHandle.restype = wintypes.BOOL
kernel.ReadFile.argtypes = [HANDLE, ctypes.c_void_p, DWORD, ctypes.POINTER(DWORD), ctypes.c_void_p]
kernel.ReadFile.restype = wintypes.BOOL
kernel.WriteFile.argtypes = [HANDLE, ctypes.c_void_p, DWORD, ctypes.POINTER(DWORD), ctypes.c_void_p]
kernel.WriteFile.restype = wintypes.BOOL
kernel.SetFilePointerEx.argtypes = [HANDLE, ctypes.c_longlong, ctypes.c_void_p, DWORD]
kernel.SetFilePointerEx.restype = wintypes.BOOL
kernel.SetEndOfFile.argtypes = [HANDLE]
kernel.SetEndOfFile.restype = wintypes.BOOL
kernel.FlushFileBuffers.argtypes = [HANDLE]
kernel.FlushFileBuffers.restype = wintypes.BOOL
kernel.SetFileInformationByHandle.argtypes = [HANDLE, DWORD, ctypes.c_void_p, DWORD]
kernel.SetFileInformationByHandle.restype = wintypes.BOOL
security.GetKernelObjectSecurity.argtypes = [HANDLE, DWORD, ctypes.c_void_p, DWORD, ctypes.POINTER(DWORD)]
security.GetKernelObjectSecurity.restype = wintypes.BOOL
security.SetKernelObjectSecurity.argtypes = [HANDLE, DWORD, ctypes.c_void_p]
security.SetKernelObjectSecurity.restype = wintypes.BOOL
security.GetSecurityDescriptorOwner.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.BOOL)]
security.GetSecurityDescriptorOwner.restype = wintypes.BOOL
security.GetSecurityDescriptorControl.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.WORD), ctypes.POINTER(DWORD)]
security.GetSecurityDescriptorControl.restype = wintypes.BOOL
security.EqualSid.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
security.EqualSid.restype = wintypes.BOOL


class FileInfo(ctypes.Structure):
    _fields_ = [("attributes", DWORD), ("created", wintypes.FILETIME), ("accessed", wintypes.FILETIME),
                ("modified", wintypes.FILETIME), ("volume", DWORD), ("size_high", DWORD), ("size_low", DWORD),
                ("links", DWORD), ("index_high", DWORD), ("index_low", DWORD)]


class BasicInfo(ctypes.Structure):
    _fields_ = [("created", ctypes.c_longlong), ("accessed", ctypes.c_longlong),
                ("modified", ctypes.c_longlong), ("changed", ctypes.c_longlong), ("attributes", DWORD)]


def checked(result):
    if not result:
        raise ctypes.WinError(ctypes.get_last_error())
    return result


def open_handle(stack, path, access, share, disposition=OPEN_EXISTING, directory=False):
    flags = OPEN_REPARSE | (BACKUP_SEMANTICS if directory else 0)
    handle = kernel.CreateFileW(str(path), access, share, None, disposition, flags, None)
    if handle == INVALID:
        raise ctypes.WinError(ctypes.get_last_error())
    stack.callback(kernel.CloseHandle, handle)
    info = FileInfo()
    checked(kernel.GetFileInformationByHandle(handle, ctypes.byref(info)))
    if info.attributes & REPARSE or bool(info.attributes & DIRECTORY) != directory or kernel.GetFileType(handle) != FILE_TYPE_DISK:
        raise OSError("unsafe-path")
    if not directory and info.links != 1:
        raise OSError("unsafe-path")
    return handle, info


def components(root, path):
    relative = path.relative_to(root)
    if not relative.parts or any(part in (".", "..") or ":" in part or part.endswith((" ", ".")) for part in relative.parts):
        raise ValueError("unsafe-path")
    return relative


def pin_parent(stack, root, target, create):
    current = Path(root.anchor)
    parent, _ = open_handle(stack, current, READ_ATTRIBUTES, SHARE_READ_WRITE, directory=True)
    for part in root.parts[1:]:
        current = current / part
        parent, _ = open_handle(stack, current, READ_ATTRIBUTES, SHARE_READ_WRITE, directory=True)
    for part in target.parts[:-1]:
        current = current / part
        if create:
            try:
                os.mkdir(current)
            except FileExistsError:
                pass
        parent, _ = open_handle(stack, current, READ_ATTRIBUTES, SHARE_READ_WRITE, directory=True)
    return parent, current


def read_handle(handle, info):
    size = (info.size_high << 32) | info.size_low
    if size > MAX_BYTES:
        raise ValueError("oversized")
    checked(kernel.SetFilePointerEx(handle, 0, None, 0))
    buffer = ctypes.create_string_buffer(max(size, 1))
    count = DWORD()
    checked(kernel.ReadFile(handle, buffer, size, ctypes.byref(count), None))
    if count.value != size:
        raise OSError("short-read")
    return buffer.raw[:size]


def write_handle(handle, data):
    checked(kernel.SetFilePointerEx(handle, 0, None, 0))
    checked(kernel.SetEndOfFile(handle))
    count = DWORD()
    buffer = ctypes.create_string_buffer(data, max(len(data), 1))
    checked(kernel.WriteFile(handle, buffer, len(data), ctypes.byref(count), None))
    if count.value != len(data):
        raise OSError("short-write")
    checked(kernel.FlushFileBuffers(handle))


def rename_handle(handle, parent, name, replace):
    encoded_length = len(name.encode('utf-16-le'))
    class RenameInfo(ctypes.Structure):
        _fields_ = [("replace", DWORD), ("root", HANDLE), ("length", DWORD), ("name", wintypes.WCHAR * (encoded_length // 2 + 1))]
    info = RenameInfo(int(replace), parent, encoded_length, name)
    checked(kernel.SetFileInformationByHandle(handle, 3, ctypes.byref(info), ctypes.sizeof(info)))


def delete_handle(handle):
    disposition = ctypes.c_ubyte(1)
    checked(kernel.SetFileInformationByHandle(handle, 4, ctypes.byref(disposition), ctypes.sizeof(disposition)))


def identity(info):
    return [info.volume, info.index_high, info.index_low]


def lock_key(target):
    return sha256(os.fsencode(os.path.normcase(str(target)))).hexdigest()


def directory_key(info):
    return sha256(json.dumps(identity(info), separators=(',', ':')).encode('ascii')).hexdigest()


def lock_directory(stack, root, create):
    target = Path('.upf-tools', 'write-locks', 'placeholder')
    return pin_parent(stack, root, target, create)[1]


def lease(stack, directory, key, create):
    path = directory / key
    return open_handle(stack, path, READ | WRITE, 0, OPEN_ALWAYS if create else OPEN_EXISTING)


def read_current(stack, parent, name):
    try:
        handle, info = open_handle(stack, parent / name, READ | READ_CONTROL, SHARE_READ_WRITE | 0x4)
        return read_handle(handle, info).decode('utf-8'), handle, info
    except FileNotFoundError:
        return None, None, None


def security_descriptor(handle, flags):
    required = DWORD()
    security.GetKernelObjectSecurity(handle, flags, None, 0, ctypes.byref(required))
    if not required.value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = ctypes.create_string_buffer(required.value)
    checked(security.GetKernelObjectSecurity(handle, flags, descriptor, required.value, ctypes.byref(required)))
    return descriptor


def owner(descriptor):
    sid = ctypes.c_void_p()
    defaulted = wintypes.BOOL()
    checked(security.GetSecurityDescriptorOwner(descriptor, ctypes.byref(sid), ctypes.byref(defaulted)))
    if not sid.value:
        raise PermissionError('missing-owner')
    return sid


def preserve_security(source, destination):
    original = security_descriptor(source, 0x5)
    replacement = security_descriptor(destination, 0x1)
    if not security.EqualSid(owner(original), owner(replacement)):
        raise PermissionError('owner-mismatch')
    control, revision = wintypes.WORD(), DWORD()
    checked(security.GetSecurityDescriptorControl(original, ctypes.byref(control), ctypes.byref(revision)))
    protection = 0x80000000 if control.value & 0x1000 else 0x20000000
    checked(security.SetKernelObjectSecurity(destination, 0x4 | protection, original))


def preserve_attributes(info, destination):
    basic = BasicInfo(0, 0, 0, 0, info.attributes)
    checked(kernel.SetFileInformationByHandle(destination, 0, ctypes.byref(basic), ctypes.sizeof(basic)))


def recover(stack, root, lock, info, expected_key):
    raw = read_handle(lock, info)
    if not raw:
        return
    record = json.loads(raw)
    target = components(root, root / record['target'])
    name = record['name']
    kind = record['kind']
    if kind == 'file' and not re.fullmatch(rf'{re.escape(target.name)}\.upf-[0-9a-f]{{32}}\.tmp', name):
        raise ValueError('unsafe-receipt')
    if kind == 'stage' and (target.parts[:-1] != ('.upf-tools', 'staging') or name != target.name or not re.fullmatch(r'stage-[0-9a-f]{32}', name)):
        raise ValueError('unsafe-receipt')
    if kind not in ('file', 'stage'):
        raise ValueError('unsafe-receipt')
    _, directory = pin_parent(stack, root, target, False)
    _, parent_info = open_handle(stack, directory, READ_ATTRIBUTES, SHARE_READ_WRITE, directory=True)
    actual_key = directory_key(parent_info) if kind == 'file' else lock_key(target)
    if actual_key != expected_key:
        raise ValueError('unsafe-receipt')
    try:
        handle, current = open_handle(stack, directory / name, DELETE | READ_ATTRIBUTES, SHARE_READ_WRITE, directory=kind == 'stage')
    except FileNotFoundError:
        return
    if identity(current) != record['identity']:
        raise ValueError('changed-receipt')
    if kind == 'stage':
        parent, _ = open_handle(stack, directory, READ_ATTRIBUTES | ADD_FILE, SHARE_READ_WRITE, directory=True)
        rename_handle(handle, parent, 'recovered-' + uuid4().hex, False)
    else:
        delete_handle(handle)


def read_confined(root, path):
    target = components(root, path)
    try:
        with ExitStack() as stack:
            _, directory = pin_parent(stack, root, target, False)
            return json.dumps({'content': read_current(stack, directory, target.name)[0]})
    except FileNotFoundError:
        return json.dumps({'content': None})


def update(root, path, content, previous, preserve_mode=False):
    target = components(root, path)
    with ExitStack() as stack:
        locks = lock_directory(stack, root, True)
        _, directory = pin_parent(stack, root, target, True)
        parent, parent_info = open_handle(stack, directory, READ_ATTRIBUTES | ADD_FILE, SHARE_READ_WRITE, directory=True)
        key = directory_key(parent_info)
        lock, lock_info = lease(stack, locks, key, True)
        recover(stack, root, lock, lock_info, key)
        with ExitStack() as source_stack:
            current, source, source_info = read_current(source_stack, directory, target.name)
            if current != previous:
                return 'modified-file'
            temporary = target.name + '.upf-' + uuid4().hex + '.tmp'
            handle, info = open_handle(stack, directory / temporary, WRITE | DELETE | READ_ATTRIBUTES | READ_CONTROL | WRITE_DAC, 0, CREATE_NEW)
            record = {'kind': 'file', 'target': str(target), 'lockKey': key, 'name': temporary, 'identity': identity(info)}
            write_handle(lock, json.dumps(record).encode('utf-8'))
            try:
                if preserve_mode and source is not None:
                    preserve_security(source, handle)
                write_handle(handle, content.encode('utf-8'))
                if preserve_mode and source_info is not None:
                    preserve_attributes(source_info, handle)
            except BaseException:
                delete_handle(handle)
                raise
        try:
            rename_handle(handle, parent, target.name, current is not None)
        except BaseException:
            delete_handle(handle)
            raise
        write_handle(lock, b'')
        return 'written'


def stage(root):
    target = Path('.upf-tools', 'staging', 'stage-' + uuid4().hex)
    with ExitStack() as stack:
        locks = lock_directory(stack, root, True)
        _, directory = pin_parent(stack, root, target, True)
        parent, _ = open_handle(stack, directory, READ_ATTRIBUTES | ADD_FILE, SHARE_READ_WRITE, directory=True)
        lock, _ = lease(stack, locks, lock_key(target), True)
        os.mkdir(directory / target.name)
        handle, info = open_handle(stack, directory / target.name, DELETE | READ_ATTRIBUTES, SHARE_READ_WRITE | 0x4, directory=True)
        write_handle(lock, json.dumps({'kind': 'stage', 'target': str(target), 'name': target.name, 'identity': identity(info)}).encode('utf-8'))
        print(target.name, flush=True)
        sys.stdin.buffer.read(1)
        try:
            with ExitStack() as inspection:
                _, current = open_handle(inspection, directory / target.name, READ_ATTRIBUTES, SHARE_READ_WRITE | 0x4, directory=True)
                if identity(current) == identity(info):
                    rename_handle(handle, parent, 'recovered-' + uuid4().hex, False)
        except FileNotFoundError:
            pass
        write_handle(lock, b'')
        return 'written'


def sweep(root):
    try:
        with ExitStack() as outer:
            locks = lock_directory(outer, root, False)
            for name in filter(lambda item: re.fullmatch(r'[0-9a-f]{64}', item), os.listdir(locks)):
                try:
                    with ExitStack() as stack:
                        lock, info = open_handle(stack, locks / name, READ | WRITE, 0)
                        raw = read_handle(lock, info)
                        record = json.loads(raw) if raw else None
                        if record and record.get('lockKey', lock_key(Path(record['target']))) == name:
                            recover(stack, root, lock, info, name)
                            write_handle(lock, b'')
                except FileNotFoundError:
                    continue
                except OSError as error:
                    if getattr(error, 'winerror', None) in (32, 33):
                        continue
                    return 'tooling-storage'
                except (ValueError, KeyError, TypeError):
                    return 'tooling-storage'
        return 'written'
    except FileNotFoundError:
        return 'written'


def main():
    root, path = map(Path, sys.argv[1:3])
    try:
        if len(sys.argv) == 4 and sys.argv[3] == '--read':
            return read_confined(root, path)
        if str(path) == '--sweep':
            return sweep(root)
        if str(path) == '--stage':
            return stage(root)
        request = json.load(sys.stdin)
        return update(root, path, request['content'], request['previous'], request.get('preserveMode', False))
    except (ValueError, UnicodeError):
        return 'symlink-escape'
    except OSError as error:
        failure = getattr(error, 'winerror', None)
        return {2: 'tooling-storage', 3: 'tooling-storage', 5: 'write-denied', 32: 'write-busy', 33: 'write-busy', 80: 'write-busy', 183: 'write-busy'}.get(failure, 'write-denied' if isinstance(error, PermissionError) else 'symlink-escape')


if __name__ == '__main__':
    print(main())

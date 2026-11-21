import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { fail, object, ok, parseJson, type Result } from "@agent-plugins/project";
import { command } from "./tooling-process.js";

export const setupFailure = (message: string): Result<never> => fail("tooling-storage", message,
  "Preserve existing files. Check permissions or reconcile the conflicting path, then resume this setup step.");
const code = (error: unknown): unknown => object(error) ? error.code : undefined;
const fileFailure = (error: unknown, message: string): Result<never> => {
  switch (code(error)) {
    case "EACCES":
    case "EPERM":
    case "EROFS": return fail("write-denied", message, "Restore write access to the accepted setup path and rerun.");
    case "EEXIST":
    case "EBUSY": return fail("write-busy", message, "Wait for the other setup to finish before rerunning.");
    case "ELOOP": return unsafePath();
    default: return setupFailure(message);
  }
};
const unsafePath = (): Result<never> => fail("symlink-escape", "The tooling path escapes the project or follows a symbolic link.",
  "Preserve the linked path and choose an unlinked location inside the project.");
const changedFile = (): Result<never> => fail("modified-file", "Configuration changed during setup.",
  "Preserve the current contents and reconcile them before rerunning setup.");
export const readText = (path: string): Promise<Result<string | null>> => readFile(path, "utf8").then((value) => ok(value as string | null))
  .catch((error: unknown) => code(error) === "ENOENT" ? ok(null) : setupFailure("A setup file is unreadable."));

/** No setup output can traverse a link or escape the accepted project directory. */
export const safePath = (project: string, path: string): Promise<boolean> => {
  const child = relative(project, resolve(path));
  return isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`) || child === "" ? Promise.resolve(false)
    : safeParts(project, child.split(sep));
};
const safeParts = (base: string, parts: readonly string[]): Promise<boolean> => {
  const [part, ...rest] = parts;
  return part === undefined ? Promise.resolve(true) : lstat(join(base, part)).then((stat) =>
    stat.isSymbolicLink() ? false : safeParts(join(base, part), rest))
    .catch((error: unknown) => code(error) === "ENOENT");
};
/** The project root itself is the accepted base, so files such as `.mcp.json` may live directly in it. */
export const directory = (project: string, path: string): Promise<Result<string>> => safePath(project, path).then((safe) => safe || resolve(path) === resolve(project)
  ? mkdir(path, { recursive: true }).then(() => ok(path)).catch((error: unknown) => fileFailure(error, "Cannot create the accepted tooling directory."))
  : unsafePath());

/** Compare before atomic replacement; lock prevents two setup writers overwriting each other's configuration. */
export const writeText = (project: string, path: string, content: string, previous: string | null, python = "python3"): Promise<Result<string>> =>
  safePath(project, path).then((safe) => safe
    ? realpath(project).then((root) => lockedWrite(python, root, join(root, relative(project, path)), content, previous))
      .catch((error: unknown) => fileFailure(error, "Could not resolve the setup project."))
    : unsafePath());

const WRITER = fileURLToPath(new URL("../scripts/setup-write.py", import.meta.url));
/** The writer's last diagnostic line names the cause, such as a missing module or an unsupported Python. */
const writerCrash = (diagnostics: string): string =>
  `The isolated setup writer could not finish${diagnostics.trim() === "" ? "" : `: ${diagnostics.trim().split("\n").at(-1)?.slice(0, 200)}`}.`;
const lockedWrite = (python: string, project: string, path: string, content: string, previous: string | null): Promise<Result<string>> =>
  runWriter(python, project, path, JSON.stringify({ content, previous }));
const runWriter = (python: string, project: string, target: string, input: string): Promise<Result<string>> =>
  new Promise((settle) => {
    const child = execFile(python, ["-I", WRITER, project, target], { cwd: project, timeout: 30_000, maxBuffer: 8_192 }, (error, output, diagnostics) =>
      settle(error === null ? writeResult(target, output.trim())
        : setupFailure(writerCrash(code(error) === "ENOENT" ? `${python} was not found` : String(diagnostics)))));
    child.stdin?.on("error", () => settle(setupFailure("The isolated setup writer could not accept its input.")));
    child.stdin?.end(input);
  });

/** Resume cleanup only when this project already has write receipts. */
export const sweepSetupWrites = (project: string, python: string): Promise<Result<string>> =>
  lstat(join(project, ".upf-tools", "write-locks")).then(() => realpath(project).then((root) =>
    runWriter(python, root, "--sweep", "")))
    .catch((error: unknown) => code(error) === "ENOENT" ? ok(project) : fileFailure(error, "Could not inspect interrupted setup writes."));

/** Keep a private staging lease live until a directory is published or the installer exits. */
export const withSetupStage = async <A>(project: string, python: string, use: (path: string) => Promise<Result<A>>): Promise<Result<A>> => {
  const root = await realpath(project);
  const child = spawn(python, ["-I", WRITER, root, "--stage"], { cwd: root, stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  child.once("error", () => child.stdout.destroy());
  child.stdin.on("error", () => child.stdout.destroy());
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  const first = await lines.next();
  clearTimeout(timer);
  try {
    return !first.done && /^stage-[0-9a-f]{32}$/.test(first.value)
      ? await use(join(project, ".upf-tools", "staging", first.value))
      : setupFailure("Could not reserve a private staging directory.");
  } finally {
    child.stdin.end();
    await lines.next();
  }
};

const writeResult = (path: string, result: string): Result<string> => {
  switch (result) {
    case "written": return ok(path);
    case "modified-file": return changedFile();
    case "symlink-escape": return unsafePath();
    case "write-busy": return fileFailure({ code: "EBUSY" }, "Another setup holds the file lock.");
    case "write-denied": return fileFailure({ code: "EACCES" }, "The setup path is not writable.");
    default: return setupFailure("A setup configuration could not be saved.");
  }
};

/** Save exact reviewed bytes privately before replacing an installer-owned file. */
export const backupOwnedText = (project: string, path: string, content: string, python: string): Promise<Result<string>> => {
  const backup = `${path}.upf-backup-${randomUUID()}`;
  return writeText(project, backup, content, null, python)
    .then((saved) => saved.ok ? readFile(backup).then((bytes) => bytes.equals(Buffer.from(content))
      ? ok(backup) : setupFailure("The installer backup did not match the original file.")) : saved)
    .catch((error: unknown) => fileFailure(error, "Could not save and verify an installer backup."));
};

/** Existing Python runtime parses TOML; bootstrap does not add another configuration parser. */
export const readToml = (python: string, path: string, project: string): Promise<Result<unknown>> =>
  readText(path).then((read) => !read.ok ? read : read.value === null ? ok({})
    : command(python, ["-c", "import json,sys,tomllib; print(json.dumps(tomllib.load(open(sys.argv[1],'rb'))))", path], project)
      .then((result) => result.ok ? parseJson(result.value) : result));

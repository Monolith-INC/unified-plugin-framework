import { lstat, mkdir, readFile, rename, writeFile, open, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fail, object, ok, parseJson, type Result } from "@agent-plugins/project";
import { command } from "./tooling-process.js";

export const setupFailure = (message: string): Result<never> => fail("tooling-storage", message,
  "Preserve existing files. Check permissions or reconcile the conflicting path, then resume this setup step.");
const code = (error: unknown): unknown => object(error) ? error.code : undefined;
export const readText = (path: string): Promise<Result<string | null>> => readFile(path, "utf8").then((value) => ok(value as string | null))
  .catch((error: unknown) => code(error) === "ENOENT" ? ok(null) : setupFailure("A setup file is unreadable."));

/** No setup output can traverse a link or escape the accepted project directory. */
export const safePath = (project: string, path: string): Promise<boolean> => {
  const child = relative(project, resolve(path));
  return child.startsWith("..") || child === "" || resolve(project, child) !== resolve(path) ? Promise.resolve(false)
    : safeParts(project, child.split(/[\\/]/));
};
const safeParts = (base: string, parts: readonly string[]): Promise<boolean> => {
  const [part, ...rest] = parts;
  return part === undefined ? Promise.resolve(true) : lstat(join(base, part)).then((stat) =>
    stat.isSymbolicLink() ? false : safeParts(join(base, part), rest))
    .catch((error: unknown) => code(error) === "ENOENT");
};
export const directory = (project: string, path: string): Promise<Result<string>> => safePath(project, path).then((safe) => safe
  ? mkdir(path, { recursive: true }).then(() => ok(path)).catch(() => setupFailure("Cannot create the accepted tooling directory."))
  : setupFailure("The tooling path escapes the project or follows a symbolic link."));

/** Compare before atomic replacement; lock prevents two setup writers overwriting each other's configuration. */
export const writeText = (project: string, path: string, content: string, previous: string | null): Promise<Result<string>> =>
  directory(project, dirname(path)).then((dir) => dir.ok ? lockedWrite(project, path, content, previous) : dir);
const lockedWrite = (project: string, path: string, content: string, previous: string | null): Promise<Result<string>> =>
  open(`${path}.upf.lock`, "wx").then((lock) => guardedWrite(project, path, content, previous)
    .finally(() => lock.close().then(() => unlink(`${path}.upf.lock`))))
    .catch(() => setupFailure("Another setup is writing this configuration, or access failed."));
const guardedWrite = (project: string, path: string, content: string, previous: string | null): Promise<Result<string>> =>
  Promise.all([safePath(project, path), readText(path)]).then(([safe, read]) => safe && read.ok && read.value === previous
    ? atomicText(path, content) : setupFailure("Configuration changed during setup or the path is unsafe; reload it before resuming."));
const atomicText = (path: string, content: string): Promise<Result<string>> => {
  const temp = `${path}.${randomUUID()}.tmp`;
  return writeFile(temp, content, { flag: "wx", mode: 0o600 }).then(() => rename(temp, path)).then(() => ok(path))
    .catch(() => setupFailure("A setup configuration could not be saved. Preserve its previous contents and retry after resolving access."));
};

/** Existing Python runtime parses TOML; bootstrap does not add another configuration parser. */
export const readToml = (python: string, path: string, project: string): Promise<Result<unknown>> =>
  readText(path).then((read) => !read.ok ? read : read.value === null ? ok({})
    : command(python, ["-c", "import json,sys,tomllib; print(json.dumps(tomllib.load(open(sys.argv[1],'rb'))))", path], project)
      .then((result) => result.ok ? parseJson(result.value) : result));

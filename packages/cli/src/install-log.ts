import { appendFile, chmod, mkdir, mkdtemp, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;
const RETAINED_RUNS = 10;
const secretName = /(secret|token|password|api[_-]?key|credential|authorization)/i;
const redactUrl = (value: string): string => value.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[REDACTED]@");

const redact = (value: unknown, key = ""): unknown => {
  switch (typeof value) {
    case "string": return secretName.test(key) && value.length >= 8 ? "[REDACTED]" : redactUrl(value);
    case "object": return value === null ? null : Array.isArray(value)
      ? value.map((entry) => redact(entry))
      : Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, redact(entry, name)]));
    default: return value;
  }
};

const projectKey = (project: string): string => createHash("sha256").update(resolve(project)).digest("hex").slice(0, 20);
const logName = (date: Date, id: string): string => `run-${date.toISOString().replaceAll(":", "-")}-${id}.jsonl`;
const fallbackPrefix = (project: string): string => `upf-install-${projectKey(project)}-`;
const fallbackDirectories = (project: string): Promise<readonly string[]> => readdir(tmpdir(), { withFileTypes: true })
  .then((entries) => entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(fallbackPrefix(project)))
    .map((entry) => join(tmpdir(), entry.name)))
  .then((directories) => Promise.all(directories.map(async (directory) => ({ directory,
    key: await readFile(join(directory, ".project-key"), "utf8").catch(() => "") })))
    .then((entries) => entries.filter(({ key }) => key === projectKey(project)).map(({ directory }) => directory)))
  .catch(() => []);
const createFallbackDirectory = async (project: string): Promise<string> => {
  const existing = await fallbackDirectories(project);
  return existing[0] ?? mkdtemp(join(tmpdir(), fallbackPrefix(project))).then(async (directory) => {
    await Promise.all([chmod(directory, PRIVATE_DIR), writeFile(join(directory, ".project-key"), projectKey(project), { mode: PRIVATE_FILE })]);
    return directory;
  });
};
const appendRun = (path: string, entries: readonly unknown[]): Promise<string | null> =>
  appendFile(path, `${entries.map((entry) => JSON.stringify(redact(entry))).join("\n")}\n`, { mode: PRIVATE_FILE })
    .then(() => chmod(path, PRIVATE_FILE)).then(() => path).catch(() => null);

const managedLog = (name: string): boolean => /^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f-]{36}\.jsonl$/.test(name);
const retainTen = (directory: string): Promise<unknown> => readdir(directory, { withFileTypes: true })
  .then((entries) => Promise.all(entries.filter((entry) => entry.isFile() && managedLog(entry.name))
    .map((entry) => join(directory, entry.name)).map(async (path) => ({ path, modified: (await stat(path)).mtimeMs }))))
  .then((files) => Promise.all([...files].sort((left, right) => right.modified - left.modified).slice(RETAINED_RUNS)
    .map(({ path }) => unlink(path).catch(() => undefined)))).catch(() => undefined);

/** Store a redacted run without allowing logging failures to interrupt setup. */
const storeInstallLog = async (project: string, entries: readonly unknown[], requestedPath?: string): Promise<string | null> => {
  const date = new Date();
  const name = logName(date, randomUUID());
  const primary = requestedPath === undefined ? join(project, ".upf-tools", "logs") : dirname(resolve(project, requestedPath));
  const path = requestedPath === undefined ? join(primary, name) : resolve(project, requestedPath);
  const primaryResult = await mkdir(primary, { recursive: true, mode: PRIVATE_DIR })
    .then(() => requestedPath === undefined ? chmod(primary, PRIVATE_DIR) : undefined)
    .then(() => appendRun(path, entries)).catch(() => null);
  const fallback = primaryResult === null ? await createFallbackDirectory(project).catch(() => null) : null;
  const stored = primaryResult ?? (fallback === null ? null : await appendRun(join(fallback, name), entries));
  const selected = stored ?? null;
  return selected === null ? null : (requestedPath === undefined || fallback !== null
    ? retainTen(dirname(selected)) : Promise.resolve()).then(() => selected);
};

export const writeInstallLog = (project: string, entries: readonly unknown[], requestedPath?: string): Promise<string | null> =>
  storeInstallLog(project, entries, requestedPath).catch(() => null);

const recentFiles = async (directory: string): Promise<readonly string[]> => readdir(directory, { withFileTypes: true })
  .then((entries) => Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(directory, entry.name)).map(async (path) => ({ path, modified: (await stat(path)).mtimeMs }))))
  .then((files) => [...files].sort((left, right) => right.modified - left.modified).map(({ path }) => path)).catch(() => []);

/** Read the most recent project log, including the private fallback location. */
const loadLastInstallLog = async (project: string): Promise<{ readonly path: string; readonly entries: readonly unknown[] } | null> => {
  const fallback = await fallbackDirectories(project);
  const files = [...await recentFiles(join(project, ".upf-tools", "logs")), ...await Promise.all(fallback.map(recentFiles)).then((groups) => groups.flat())];
  const latest = [...await Promise.all(files.map(async (path) => ({ path, modified: (await stat(path)).mtimeMs })))]
    .sort((left, right) => right.modified - left.modified)[0]?.path;
  return latest === undefined ? null : readFile(latest, "utf8").then((text) => ({ path: latest,
    entries: text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown) })).catch(() => null);
};

export const readLastInstallLog = (project: string): Promise<{ readonly path: string; readonly entries: readonly unknown[] } | null> =>
  loadLastInstallLog(project).catch(() => null);

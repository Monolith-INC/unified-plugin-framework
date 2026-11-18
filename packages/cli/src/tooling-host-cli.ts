import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fail, object, type Result } from "@agent-plugins/project";
import type { HostName } from "./host-names.js";
import { command, selectEnvironment } from "./tooling-process.js";
import { PINS } from "./tooling-recovery.js";

interface NativePin { readonly url: string; readonly integrity: string; readonly member: string }
const CLAUDE_PINS = {
  x64: "sha512-GX+7CUng2R5f7SsA2w0LaXlH2f62fRCFD/Z2SUexoeH3B0KfulKQt5DtY9NeD2Yp3VEBz6/k/xWSbGPUi6NV2A==",
  arm64: "sha512-FUVVH3aQbLEChjv5wQLdFbpBC7bclVIdVYO5hDzJthDyf2OQtdubIP5QqLPgEScQb3CVIAFg2IPJ5nihJa8Ndw==",
  "x64-musl": "sha512-H1tn//6H1EOlkC87CYYs1iwz5rvMjGiyUpIR+8Pu0dRwA+DLAkQXgJGb0yRc+O8IWSZOhgWjarRIbPsS1cK2eg==",
  "arm64-musl": "sha512-bZRgaooI/08JmS9d0lLfv9s7N6aO8Ykd0u2U6dmRsBQ1Tq1VFY5ZOi6hfoJBOwS4+1OR3xaUGYRS10i7dZBn9g==",
} as const;
const CODEX_PINS = {
  x64: "sha512-CxDm3+D1cpbGJeHrdzINoG+3wn9BVncP4qpZaaNYkxe8iPtRJOYyCJnnPoVjWRIBvI9vPKbRoifsMSA5xDaUpw==",
  arm64: "sha512-w0ScAsBr9aZKtIFrh6HN6KU2yjKKeSCzYfbb7DB0Ccj4BYPzeZtUeQprbycLCwuX3AFQdbdjapmLho2iot74jQ==",
} as const;
const nativePin = (host: HostName, arch: "x64" | "arm64", musl: boolean): NativePin => {
  const registry = "https://registry.npmjs.org";
  const version = PINS.hostClis[host].version;
  const suffix = musl ? `${arch}-musl` as const : arch;
  switch (host) {
    case "claude": {
      const name = `claude-code-linux-${suffix}`;
      return { url: `${registry}/@anthropic-ai/${name}/-/${name}-${version}.tgz`, integrity: CLAUDE_PINS[suffix], member: "package/claude" };
    }
    case "codex": return { url: `${registry}/@openai/codex/-/codex-${version}-linux-${arch}.tgz`,
      integrity: CODEX_PINS[arch], member: `package/vendor/${arch === "x64" ? "x86_64" : "aarch64"}-unknown-linux-musl/bin/codex` };
  }
};

export type HostCli = { readonly kind: "available"; readonly program: string; readonly source: "path" | "private"; readonly installed: boolean }
  | { readonly kind: "missing"; readonly attempted: boolean };
const missing = (attempted: boolean): HostCli => ({ kind: "missing", attempted });
const available = (program: string, source: "path" | "private", installed = false): HostCli => ({ kind: "available", program, source, installed });
const onDisk = (file: string): Promise<boolean> => stat(file).then((entry) => entry.isFile()
  ? access(file, constants.X_OK).then(() => true) : false).catch(() => false);
const onPath = async (host: HostName, environment: NodeJS.ProcessEnv): Promise<string | undefined> => {
  const candidates = (environment["PATH"] ?? "").split(delimiter).filter(isAbsolute).map((dir) => join(dir, host));
  const matches = await Promise.all(candidates.map(onDisk));
  return candidates.find((_, index) => matches[index]);
};
const inside = (root: string, path: string): boolean => {
  const child = relative(root, path);
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
};
const privateDir = (path: string): Promise<boolean> => lstat(path).then((entry) => entry.isDirectory()
  && (entry.mode & 0o077) === 0 && (process.getuid === undefined || process.getuid() === entry.uid)).catch(() => false);
const fileDigest = async (file: string, algorithm: "sha256" | "sha512", encoding: "hex" | "base64"): Promise<string> => {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(file), hash);
  return hash.digest(encoding);
};
const installationRoot = (root: string, host: HostName, pin: NativePin): string =>
  join(root, `${host}-${PINS.hostClis[host].version}-${createHash("sha256").update(pin.integrity).digest("hex").slice(0, 12)}`);
const receiptText = async (directory: string, pin: NativePin): Promise<string> =>
  `${pin.integrity}\n${await fileDigest(join(directory, pin.member), "sha256", "hex")}\n`;
const installedProgram = async (directory: string, pin: NativePin): Promise<string | null> => {
  if (!await privateDir(directory)) return null;
  const executable = join(directory, pin.member);
  const path = await realpath(executable).catch(() => null);
  if (path === null || path !== executable || !await onDisk(path)) return null;
  const receipt = await readFile(join(directory, "receipt"), "utf8").catch(() => null);
  return receipt !== null && receipt === await receiptText(directory, pin) ? executable : null;
};
const download = async (pin: NativePin, target: string, fetcher: typeof fetch): Promise<boolean> => {
  const response = await fetcher(pin.url, { redirect: "error", signal: AbortSignal.timeout(150_000) });
  const length = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || response.body === null || length <= 0 || length > 256 * 1024 * 1024) return false;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target, { mode: 0o600, flags: "wx" }));
  return `sha512-${await fileDigest(target, "sha512", "base64")}` === pin.integrity;
};
const EXTRACT = `import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], "r:gz") as archive:
    members = archive.getmembers()
    assert all(m.isfile() and pathlib.PurePosixPath(m.name).parts[0] == "package" for m in members)
    archive.extractall(sys.argv[2], members=members, filter="data")`;
const fetchNative = async (scratch: string, pin: NativePin, python: string, environment: NodeJS.ProcessEnv, fetcher: typeof fetch): Promise<Result<string>> => {
  const archive = join(scratch, "native.tgz");
  if (!await download(pin, archive, fetcher)) return fail("checksum-mismatch", "The pinned host package did not verify.", "Install its official CLI manually.");
  const clean = selectEnvironment(environment, ["PATH", "HOME", "LANG", "LC_ALL"]);
  return command(python, ["-I", "-c", EXTRACT, archive, scratch], scratch, 90_000, clean);
};
const publish = async (root: string, destination: string, pin: NativePin, python: string, environment: NodeJS.ProcessEnv,
  fetcher: typeof fetch): Promise<string | null> => {
  const scratch = await mkdtemp(join(root, ".stage-"));
  try {
    const extracted = await fetchNative(scratch, pin, python, environment, fetcher);
    if (!extracted.ok) return null;
    await rm(join(scratch, "native.tgz"));
    await chmod(join(scratch, pin.member), 0o700);
    await writeFile(join(scratch, "receipt"), await receiptText(scratch, pin), { mode: 0o600, flag: "wx" });
    await rename(scratch, destination);
    return join(destination, pin.member);
  } catch {
    return installedProgram(destination, pin);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

const exists = (path: string): Promise<boolean> => lstat(path).then(() => true).catch(() => false);
const glibcRuntime = (report: unknown): boolean =>
  object(report) && object(report.header) && typeof report.header.glibcVersionRuntime === "string";
const resolveNative = async (project: string, host: HostName, python: string, consent: boolean,
  environment: NodeJS.ProcessEnv, fetcher: typeof fetch): Promise<HostCli> => {
  const arch = process.arch;
  if (process.platform !== "linux" || (arch !== "x64" && arch !== "arm64")) return missing(false);
  const pin = nativePin(host, arch, !glibcRuntime(process.report.getReport()));
  const root = join(environment["HOME"] ?? homedir(), ".local/share/unified-plugin-framework/host-clis");
  if (inside(await realpath(project), resolve(root))) return missing(false);
  if (consent) await mkdir(root, { mode: 0o700, recursive: true });
  if (!await privateDir(root)) return missing(false);
  const canonicalRoot = await realpath(root);
  if (inside(await realpath(project), canonicalRoot)) return missing(false);
  const destination = installationRoot(canonicalRoot, host, pin);
  const existing = await installedProgram(destination, pin);
  if (existing !== null) return available(existing, "private");
  if (!consent || await exists(destination)) return missing(false);
  const installed = await publish(canonicalRoot, destination, pin, python, environment, fetcher);
  return installed === null ? missing(true) : available(installed, "private", true);
};

/** Resolve a host without modifying PATH. Downloads use only pinned native packages and run no npm scripts. */
export const prepareHostCli = async (project: string, host: HostName, python: string, consent: boolean,
  environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<HostCli> => {
  const system = await onPath(host, environment);
  return system !== undefined ? available(system, "path")
    : resolveNative(project, host, python, consent, environment, fetcher).catch(() => missing(consent));
};

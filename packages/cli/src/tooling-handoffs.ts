import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { fail, object, ok, parseJson, type Result, type ToolingStep } from "@agent-plugins/project";
import { bootstrapHosts } from "./tooling-bootstrap.js";
import { directory, readText, safePath, writeText } from "./tooling-files.js";
import { forHost, parseBootstrap, planFile, type AcceptedPlan } from "./tooling-input.js";
import { nodeToolingIO } from "./tooling-node.js";
import { prepareHostCli } from "./tooling-host-cli.js";
import { TASK_KINDS, type TaskKind } from "./tooling-recovery.js";
import type { HostEnvironment } from "./host-table.js";

const PENDING = ".upf-tools/pending-tasks.json";
const CLAIMS = ".upf-tools/handoff-claims";
const LEASE_MS = 30 * 60 * 1000;
const MAX_RECORD_BYTES = 256 * 1024;
const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

interface Manifest {
  readonly plan: AcceptedPlan;
  readonly tasks: readonly TaskKind[];
  readonly identity: string;
}
type Claim = { readonly status: "active"; readonly token: string; readonly expires: number } | { readonly status: "done" };
export type HandoffAction = { readonly kind: "list" } | { readonly kind: "claim"; readonly task: TaskKind }
  | { readonly kind: "finish"; readonly task: TaskKind; readonly token: string };
type HandoffReply = { readonly status: "pending"; readonly tasks: readonly TaskKind[] }
  | { readonly status: "claimed"; readonly token: string; readonly hosts: AcceptedPlan["hosts"] }
  | { readonly status: "ignored"; readonly message: string }
  | { readonly status: "ready" | "busy" | "done" | "not-claimed" | "not-ready" };
type Ready = (task: TaskKind, plan: AcceptedPlan) => Promise<boolean>;

export const isTaskKind = (value: unknown): value is TaskKind => TASK_KINDS.some((task) => task === value);
export const handoffStateRoot = (): string => join(
  isAbsolute(process.env["XDG_STATE_HOME"] ?? "") ? process.env["XDG_STATE_HOME"] ?? homedir() : join(homedir(), ".local/state"),
  "unified-plugin-framework", "handoffs",
);
const ignored = (): Result<HandoffReply> => ok({ status: "ignored",
  message: "Ignored pending setup tasks without a matching private installer receipt. Rerun the accepted installation plan to issue new tasks." });
const invalid = (): Result<never> => fail("handoff-storage", "The installer could not verify or store the pending tasks.",
  "Preserve existing task files and rerun the accepted installation plan after checking its receipt and permissions.");

const inside = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
const privateEntry = async (path: string, directory: boolean): Promise<boolean> => lstat(path).then((info) =>
  (directory ? info.isDirectory() : info.isFile()) && (info.mode & 0o077) === 0
  && (process.getuid === undefined || info.uid === process.getuid())).catch(() => false);
const receiptPath = async (project: string, state: string): Promise<string | null> => {
  const root = await realpath(state).catch(() => null);
  return root === null || inside(project, root) || !await privateEntry(state, true) ? null : join(root, digest(project));
};
const readReceipt = (path: string | null): Promise<string | null> => path === null ? Promise.resolve(null)
  : privateEntry(path, false).then((valid) => valid ? readText(path).then((read) => read.ok ? read.value : null) : null);
const readRecord = async (project: string, path: string): Promise<Result<string | null>> => {
  if (!await safePath(project, path)) return invalid();
  return lstat(path).then((entry) => entry.isFile() && entry.size <= MAX_RECORD_BYTES ? readText(path) : invalid())
    .catch((error: unknown) => object(error) && error.code === "ENOENT" ? ok(null) : invalid());
};
const readPending = (project: string): Promise<Result<string | null>> => readRecord(project, join(project, PENDING));
const receiptMatches = (text: string, receipt: string | null): boolean => receipt === digest(text);

const publishReceipt = async (path: string, content: string): Promise<Result<string>> => {
  const stage = `${path}.${randomUUID()}`;
  return writeFile(stage, digest(content), { mode: 0o600, flag: "wx" })
    .then(() => rename(stage, path))
    .then(() => ok(path))
    .catch(() => unlink(stage).catch(() => undefined).then(invalid));
};
const savePending = async (project: string, plan: AcceptedPlan, previous: string | null, content: string): Promise<Result<string>> => {
  const path = join(project, PENDING);
  return previous === content ? ok(path) : writeText(project, path, content, previous, plan.python);
};

/** The installer alone issues receipts outside the checkout, bound to the canonical project and exact bytes. */
export const recordHandoffs = async (directoryPath: string, state: string, plan: AcceptedPlan, tasks: readonly TaskKind[]): Promise<Result<string | null>> => {
  if (tasks.length === 0) return ok(null);
  try {
    const project = await realpath(directoryPath);
    const local = await directory(project, join(project, ".upf-tools"));
    if (!local.ok) return local;
    await mkdir(state, { recursive: true, mode: 0o700 });
    const receipt = await receiptPath(project, state);
    if (receipt === null) return invalid();
    const previous = await readPending(project);
    if (!previous.ok) return previous;
    const content = JSON.stringify({ version: 1, tasks, plan: planFile(plan) });
    if (Buffer.byteLength(content) > MAX_RECORD_BYTES) return invalid();
    if (previous.value !== null && previous.value !== content && !receiptMatches(previous.value, await readReceipt(receipt))) return invalid();
    const saved = await savePending(project, plan, previous.value, content);
    return saved.ok ? publishReceipt(receipt, content).then((result) => result.ok ? ok(saved.value) : result) : saved;
  } catch {
    return invalid();
  }
};

const decodeManifest = (text: string): Manifest | null => {
  const data = parseJson(text);
  if (!data.ok || !object(data.value) || data.value.version !== 1 || !Array.isArray(data.value.tasks)) return null;
  const tasks: readonly unknown[] = data.value.tasks;
  if (!tasks.every(isTaskKind) || new Set(tasks).size !== tasks.length) return null;
  const plan = parseBootstrap(data.value.plan);
  return plan.ok ? { tasks, plan: plan.value, identity: digest(JSON.stringify(planFile(plan.value))) } : null;
};
const claimPath = (project: string, manifest: Manifest, task: TaskKind): string => join(project, CLAIMS, `${manifest.identity}-${task}.json`);
const readClaim = (text: string | null): Claim | null => {
  const parsed = parseJson(text ?? "");
  if (!parsed.ok || !object(parsed.value)) return null;
  switch (parsed.value.status) {
    case "done": return { status: "done" };
    case "active": return typeof parsed.value.token === "string" && typeof parsed.value.expires === "number"
      ? { status: "active", token: parsed.value.token, expires: parsed.value.expires } : null;
    default: return null;
  }
};
const checkedClaim = (project: string, manifest: Manifest, task: TaskKind): Promise<Result<string | null>> =>
  readRecord(project, claimPath(project, manifest, task));
const updateClaim = async (project: string, manifest: Manifest, task: TaskKind, content: Claim, previous: string | null,
  result: HandoffReply): Promise<Result<HandoffReply>> => {
  const root = await directory(project, join(project, CLAIMS));
  if (!root.ok) return root;
  const saved = await writeText(project, claimPath(project, manifest, task), JSON.stringify(content), previous, manifest.plan.python);
  return saved.ok ? ok(result) : saved.error.code === "write-busy" || saved.error.code === "modified-file" ? ok({ status: "busy" }) : saved;
};
const active = (claim: Claim | null, now: number): claim is Extract<Claim, { status: "active" }> =>
  claim?.status === "active" && claim.expires > now;
const perform = async (project: string, manifest: Manifest, action: Exclude<HandoffAction, { kind: "list" }>,
  ready: Ready, now: number): Promise<Result<HandoffReply>> => {
  if (!manifest.tasks.includes(action.task)) return ok({ status: "not-claimed" });
  const previous = await checkedClaim(project, manifest, action.task);
  if (!previous.ok) return previous;
  const claim = readClaim(previous.value);
  if (previous.value !== null && claim === null) return invalid();
  if (action.kind === "finish") {
    if (!active(claim, now) || claim.token !== action.token) return ok({ status: "not-claimed" });
    return await ready(action.task, manifest.plan)
      ? updateClaim(project, manifest, action.task, { status: "done" }, previous.value, { status: "done" })
      : ok({ status: "not-ready" });
  }
  if (claim?.status === "done") return ok({ status: "ready" });
  if (active(claim, now)) return ok({ status: "busy" });
  if (await ready(action.task, manifest.plan)) return ok({ status: "ready" });
  const token = randomUUID();
  return updateClaim(project, manifest, action.task, { status: "active", token, expires: now + LEASE_MS },
    previous.value, { status: "claimed", token, hosts: manifest.plan.hosts });
};
const pending = async (project: string, manifest: Manifest): Promise<Result<HandoffReply>> => {
  const entries = await Promise.all(manifest.tasks.map(async (task) => ({ task, claim: await checkedClaim(project, manifest, task) })));
  if (entries.some(({ claim }) => !claim.ok)) return invalid();
  return ok({ status: "pending", tasks: entries.flatMap(({ task, claim }) =>
    claim.ok && readClaim(claim.value)?.status !== "done" ? [task] : []) });
};

/** Verify the receipt before reading plan inputs or taking any task effect. */
export const manageHandoffs = async (directoryPath: string, state: string, action: HandoffAction, ready: Ready,
  now = Date.now()): Promise<Result<HandoffReply>> => {
  try {
    const project = await realpath(directoryPath);
    const text = await readPending(project);
    if (!text.ok) return ignored();
    if (text.value === null) return ok({ status: "pending", tasks: [] });
    const receipt = await readReceipt(await receiptPath(project, state));
    const manifest = receiptMatches(text.value, receipt) ? decodeManifest(text.value) : null;
    if (manifest === null) return ignored();
    return action.kind === "list" ? await pending(project, manifest) : await perform(project, manifest, action, ready, now);
  } catch {
    return invalid();
  }
};

const PROBES: Readonly<Record<TaskKind, readonly ToolingStep[]>> = {
  "knowledge-discovery": ["knowledge-runtime", "knowledge-content", "knowledge-server"],
  "review-setup": ["review"],
  "continuity-setup": ["settings"],
  "host-sign-in": ["host-discovery"],
};
const continuityInitialized = async (project: string): Promise<boolean> => {
  const raw = await readRecord(project, join(project, ".unified-plugin-framework.json"));
  const parsed = raw.ok && raw.value !== null ? parseJson(raw.value) : null;
  const journalRoot = parsed?.ok && object(parsed.value) && object(parsed.value.continuity) && typeof parsed.value.continuity.journalRoot === "string"
    ? parsed.value.continuity.journalRoot
    : null;
  return journalRoot !== null && await lstat(join(project, journalRoot)).then((info) => info.isDirectory()).catch(() => false);
};
export const handoffReady = (project: string, environment: HostEnvironment): Ready => async (task, plan) => {
  if (task === "continuity-setup") return continuityInitialized(project);
  const steps = PROBES[task];
  const programs = new Map(task === "review-setup" ? [] : await Promise.all(plan.hosts.map(async (host) =>
    [host, await prepareHostCli(project, host, plan.python, false)] as const)));
  const report = await bootstrapHosts((host) => {
    const hostCli = programs.get(host);
    return nodeToolingIO(project, forHost(plan, host), hostCli === undefined ? environment : { ...environment, hostCli });
  }, false, { ...plan, steps })();
  return report.ok && report.value.project.status === "ready" && report.value.hosts.every(({ tooling }) => tooling.status === "ready");
};

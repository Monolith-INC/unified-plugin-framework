import { access, mkdtemp, realpath, rmdir } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { bootstrapTooling, fail, object, parseJson, type Result, type ToolingIO, type ToolingOutcome, type ToolingReport } from "@agent-plugins/project";
import type { AcceptedPlan } from "./tooling-input.js";
import type { HostName } from "./host-names.js";
import { boundedOutput, selectEnvironment } from "./tooling-process.js";
import { DISCOVERY_COMPLETE, DISCOVERY_MARKER, headlessDiscovery, PINS, recoveryFor } from "./tooling-recovery.js";
import { readText, safePath, writeText } from "./tooling-files.js";
import { knowledgeExecutable } from "./tooling-runtime.js";

const CONTENT = "knowledge-content";
const SERVER = "knowledge-server";
const ready = (report: ToolingReport, step: string): boolean =>
  report.steps.some((outcome) => outcome.step === step && outcome.status === "ready");
const missing = (report: ToolingReport): boolean =>
  report.steps.some((outcome) => outcome.step === CONTENT && outcome.status === "action-required"
    && outcome.failure.code === "knowledge-discovery-needed");
const recovery = recoveryFor(CONTENT, "knowledge-discovery-needed").onFailure.instruction;
const pending = (): Result<never> => fail("knowledge-discovery-needed", "Project knowledge still needs discovery.", recovery);
const within = (root: string, path: string): boolean => {
  const child = relative(root, path);
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
};

const DISCOVERY_ENV = [
  "PATH", "HOME", "USERPROFILE", "LANG", "LC_ALL", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
] as const;

const executable = async (host: HostName, cwd: string, path: string | undefined): Promise<string | undefined> => {
  const candidates = await Promise.all((path ?? "").split(delimiter).filter(isAbsolute).map((dir) =>
    realpath(join(dir, host)).then((candidate) => access(candidate, constants.X_OK).then(() => candidate)).catch(() => undefined)));
  return candidates.find((candidate) => candidate !== undefined && !within(cwd, candidate));
};

const pinned = (version: Result<string>, host: HostName): boolean =>
  version.ok && version.value.trim().split(/\s+/).includes(PINS.hostClis[host].version);
const approved = (report: ToolingReport, plan: AcceptedPlan, candidates: readonly HostName[]): boolean =>
  plan.consent.headlessDiscovery && ready(report, "knowledge-runtime") && ready(report, "knowledge-settings") && candidates.length > 0;
const signedIn = (host: HostName, auth: Result<string>): boolean => {
  if (!auth.ok) return false;
  if (host === "codex") return true;
  const status = parseJson(auth.value);
  return status.ok && object(status.value) && status.value.loggedIn === true;
};

const runHost = async (host: HostName, project: string, runtime: string, root: string, scratch: string,
  privateProgram?: string): Promise<Result<string> | null> => {
  const env = selectEnvironment(process.env, DISCOVERY_ENV);
  const program = privateProgram ?? await executable(host, project, env.PATH);
  const run = (args: readonly string[], timeout: number) =>
    program === undefined ? Promise.resolve(pending()) : boundedOutput(program, args, scratch, timeout, env);
  const version = await run(["--version"], 5_000);
  const auth = pinned(version, host) ? await run(host === "codex" ? ["login", "status"] : ["auth", "status"], 10_000) : pending();
  if (!signedIn(host, auth)) return null;
  const discovery = await run(headlessDiscovery(host, { project, runtime, knowledgeRoot: root, isolatedDirectory: scratch }), 180_000);
  return discovery.ok && discovery.value.trim() === DISCOVERY_COMPLETE
    ? boundedOutput(runtime, ["--project", project, "--root", root, "--verify"], scratch, 60_000, env)
    : pending();
};

const tryEligibleHosts = async (candidates: readonly HostName[], project: string, runtime: string, root: string, scratch: string,
  privatePrograms: ReadonlyMap<HostName, string>): Promise<Result<string>> => {
  const [host, ...remaining] = candidates;
  return host === undefined ? pending()
    : (await runHost(host, project, runtime, root, scratch, privatePrograms.get(host))) ?? tryEligibleHosts(remaining, project, runtime, root, scratch, privatePrograms);
};

const verifyAndMark = async (project: string, plan: AcceptedPlan, candidates: readonly HostName[],
  privatePrograms: ReadonlyMap<HostName, string>): Promise<Result<string>> => {
  const canonical = await realpath(project);
  const temp = await realpath(tmpdir());
  const runtime = knowledgeExecutable(canonical);
  const root = resolve(canonical, plan.knowledge.knowledgeRoot);
  const marker = join(root, DISCOVERY_MARKER);
  const pathsSafe = await Promise.all([runtime, root, marker].map((path) => safePath(canonical, path)));
  const previous = pathsSafe.every(Boolean) ? await readText(marker) : pending();
  if (!previous.ok || within(canonical, temp)) return pending();
  const scratch = await mkdtemp(join(temp, "upf-discovery-"));
  try {
    const verified = await tryEligibleHosts(candidates, canonical, runtime, root, scratch, privatePrograms);
    return verified.ok ? writeText(canonical, marker, "verified\n", previous.value, plan.python) : verified;
  } finally {
    await rmdir(scratch).catch(() => undefined);
  }
};

/** Run once after host verification. An unavailable host or incomplete run leaves the manual hand-off. */
export const finishKnowledge = async (report: ToolingReport, project: string, plan: AcceptedPlan, tooling: ToolingIO,
  candidates: readonly HostName[] = ready(report, "host-discovery") ? plan.hosts : [],
  privatePrograms: ReadonlyMap<HostName, string> = new Map()): Promise<ToolingReport> => {
  if (!missing(report)) return report;
  const acquired = approved(report, plan, candidates) ? await verifyAndMark(project, plan, candidates, privatePrograms).catch(pending) : pending();
  const server = acquired.ok && report.steps.some(({ step }) => step === SERVER)
    ? await bootstrapTooling(tooling, false, [SERVER])() : undefined;
  const steps = report.steps.map((outcome): ToolingOutcome => {
    switch (outcome.step) {
      case CONTENT: return acquired.ok ? { step: CONTENT, status: "ready" as const, evidence: "Discovered knowledge passed fresh protocol verification." }
        : { step: CONTENT, status: "action-required" as const, failure: pendingFailure(acquired) };
      case SERVER: return server?.ok ? server.value.steps[0] ?? outcome : outcome;
      default: return outcome;
    }
  });
  return { status: steps.every((step) => step.status === "ready") ? "ready" : "action-required", steps };
};

const pendingFailure = (result: Extract<Result<unknown>, { ok: false }>) => ({
  code: "knowledge-discovery-needed",
  message: result.error.code === "knowledge-discovery-needed" ? result.error.message : "Headless discovery did not complete.",
  recovery,
});

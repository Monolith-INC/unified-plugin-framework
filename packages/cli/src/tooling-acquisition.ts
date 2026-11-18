import { access, mkdtemp, realpath, rmdir } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { bootstrapTooling, fail, type Result, type ToolingIO, type ToolingOutcome, type ToolingReport } from "@agent-plugins/project";
import type { AcceptedPlan } from "./tooling-input.js";
import type { HostName } from "./host-names.js";
import { boundedOutput } from "./tooling-process.js";
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

const cleanEnvironment = (): NodeJS.ProcessEnv => Object.fromEntries(
  ["PATH", "HOME", "USERPROFILE", "LANG", "LC_ALL", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
    .flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]),
);

const executable = async (host: HostName, cwd: string, path: string | undefined): Promise<string | undefined> => {
  const candidates = await Promise.all((path ?? "").split(delimiter).filter(isAbsolute).map((dir) =>
    realpath(join(dir, host)).then((candidate) => access(candidate, constants.X_OK).then(() => candidate)).catch(() => undefined)));
  return candidates.find((candidate) => candidate !== undefined && !within(cwd, candidate));
};

const pinned = (version: Result<string>, host: HostName): boolean =>
  version.ok && version.value.trim().split(/\s+/).includes(PINS.hostClis[host].version);
const approved = (report: ToolingReport, plan: AcceptedPlan): boolean =>
  plan.consent.headlessDiscovery && ready(report, "knowledge-runtime") && ready(report, "knowledge-settings")
    && ready(report, "host-discovery");

const runHost = async (host: HostName, project: string, runtime: string, root: string, scratch: string): Promise<Result<string>> => {
  const env = cleanEnvironment();
  const program = await executable(host, project, env.PATH);
  const run = (args: readonly string[], timeout: number) =>
    program === undefined ? Promise.resolve(pending()) : boundedOutput(program, args, scratch, timeout, env);
  const version = await run(["--version"], 5_000);
  const auth = pinned(version, host) ? await run(host === "codex" ? ["login", "status"] : ["auth", "status"], 10_000) : pending();
  const discovery = auth.ok ? await run(headlessDiscovery(host, { project, runtime, knowledgeRoot: root, isolatedDirectory: scratch }), 180_000) : auth;
  return discovery.ok && discovery.value.trim() === DISCOVERY_COMPLETE
    ? boundedOutput(runtime, ["--project", project, "--root", root, "--verify"], scratch, 60_000, env)
    : pending();
};

const verifyAndMark = async (project: string, plan: AcceptedPlan): Promise<Result<string>> => {
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
    const verified = await runHost(plan.hosts[0], canonical, runtime, root, scratch);
    return verified.ok ? writeText(canonical, marker, "verified\n", previous.value, plan.python) : verified;
  } finally {
    await rmdir(scratch).catch(() => undefined);
  }
};

/** Run once after host verification. An unavailable host or incomplete run leaves the manual hand-off. */
export const finishKnowledge = async (report: ToolingReport, project: string, plan: AcceptedPlan, tooling: ToolingIO): Promise<ToolingReport> => {
  if (!missing(report)) return report;
  const acquired = approved(report, plan) ? await verifyAndMark(project, plan).catch(pending) : pending();
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

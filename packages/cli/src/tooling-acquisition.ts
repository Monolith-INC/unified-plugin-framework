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
import { knowledgeQueryScript } from "./tooling-runtime.js";
import { HOSTS } from "./host-table.js";
import { NODE_HOST_CLI_IO } from "./tooling-host-cli.js";

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

/** Why a host was passed over: absent or unpinned (`signedOut: false`), or pinned but not signed in. */
type Skipped = { readonly signedOut: boolean };
/** One discovery attempt's fixed inputs; `environment` is the caller's, filtered before any host sees it. */
interface DiscoveryRun {
  readonly project: string;
  readonly python: string;
  readonly queryScript: string;
  readonly root: string;
  readonly scratch: string;
  readonly privatePrograms: ReadonlyMap<HostName, string>;
  readonly environment: NodeJS.ProcessEnv;
}
const runHost = async (host: HostName, context: DiscoveryRun): Promise<Result<string> | Skipped> => {
  const { project, python, queryScript, root, scratch } = context;
  const env = selectEnvironment(context.environment, DISCOVERY_ENV);
  const program = context.privatePrograms.get(host) ?? await executable(host, project, env.PATH);
  const run = (args: readonly string[], timeout: number) =>
    program === undefined ? Promise.resolve(pending()) : boundedOutput(program, args, scratch, timeout, env);
  const version = await run(["--version"], 5_000);
  const auth = pinned(version, host) ? await run(host === "codex" ? ["login", "status"] : ["auth", "status"], 10_000) : pending();
  if (!signedIn(host, auth)) return { signedOut: pinned(version, host) };
  const discovery = await run(headlessDiscovery(host, { project, python, queryScript, knowledgeRoot: root, isolatedDirectory: scratch }), 180_000);
  return discovery.ok && discovery.value.trim() === DISCOVERY_COMPLETE
    ? boundedOutput(python, [queryScript, "--root", root, "catalog"], scratch, 60_000, env)
        .then((checked) => checked.ok && checked.value.trim().split("\n").length > 1 ? checked : pending())
    : pending();
};

const signInNeeded = (hosts: readonly HostName[]): Result<never> => fail("host-sign-in-needed",
  `Headless discovery needs a signed-in assistant; not signed in: ${hosts.map((host) => HOSTS[host].label).join(", ")}.`,
  recoveryFor(CONTENT, "host-sign-in-needed").onFailure.instruction);
const exhausted = (signedOut: readonly HostName[]): Result<never> => signedOut.length > 0 ? signInNeeded(signedOut) : pending();
/** The first host that completes wins; when none does, a pinned host left signed out is named so the person can sign in. */
const tryEligibleHosts = async (candidates: readonly HostName[], context: DiscoveryRun, signedOut: readonly HostName[] = []): Promise<Result<string>> => {
  const [host, ...remaining] = candidates;
  if (host === undefined) return exhausted(signedOut);
  const outcome = await runHost(host, context);
  return "ok" in outcome ? outcome : tryEligibleHosts(remaining, context, outcome.signedOut ? [...signedOut, host] : signedOut);
};

const verifyAndMark = async (project: string, plan: AcceptedPlan, candidates: readonly HostName[],
  privatePrograms: ReadonlyMap<HostName, string>, environment: NodeJS.ProcessEnv): Promise<Result<string>> => {
  const canonical = await realpath(project);
  const temp = await realpath(tmpdir());
  const queryScript = knowledgeQueryScript(canonical);
  const root = resolve(canonical, plan.knowledge.knowledgeRoot);
  const marker = join(root, DISCOVERY_MARKER);
  const pathsSafe = await Promise.all([queryScript, root, marker].map((path) => safePath(canonical, path)));
  const previous = pathsSafe.every(Boolean) ? await readText(marker) : pending();
  if (!previous.ok || within(canonical, temp)) return pending();
  const scratch = await mkdtemp(join(temp, "upf-discovery-"));
  try {
    const verified = await tryEligibleHosts(candidates, { project: canonical, python: plan.python, queryScript, root, scratch, privatePrograms, environment });
    return verified.ok ? writeText(canonical, marker, "verified\n", previous.value, plan.python) : verified;
  } finally {
    await rmdir(scratch).catch(() => undefined);
  }
};

/** Run once after host verification. An unavailable host or incomplete run leaves the manual hand-off. */
export const finishKnowledge = async (report: ToolingReport, project: string, plan: AcceptedPlan, tooling: ToolingIO,
  candidates: readonly HostName[] = ready(report, "host-discovery") ? plan.hosts : [],
  privatePrograms: ReadonlyMap<HostName, string> = new Map(),
  environment: NodeJS.ProcessEnv = NODE_HOST_CLI_IO.environment): Promise<ToolingReport> => {
  if (!missing(report)) return report;
  const acquired = approved(report, plan, candidates) ? await verifyAndMark(project, plan, candidates, privatePrograms, environment).catch(pending) : pending();
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

const pendingFailure = (result: Extract<Result<unknown>, { ok: false }>) => result.error.code === "host-sign-in-needed" ? result.error : ({
  code: "knowledge-discovery-needed",
  message: result.error.code === "knowledge-discovery-needed" ? result.error.message : "Headless discovery did not complete.",
  recovery,
});

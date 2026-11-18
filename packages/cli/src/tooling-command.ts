import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bootstrapTooling, fail, flatMap, nodeProjectIO, ok, operate, parseJson, parseRequest, resumeTooling, TOOLING_STEPS, type Request, type Result, type ToolingIO, type ToolingReport } from "@agent-plugins/project";
import type { CliIo } from "./index.js";
import { forHost, parseBootstrap, type AcceptedPlan } from "./tooling-input.js";
import { nodeToolingIO } from "./tooling-node.js";
import { finishKnowledge } from "./tooling-acquisition.js";
import { sweepSetupWrites } from "./tooling-files.js";
import { exitCodeOf, recoveryFor } from "./tooling-recovery.js";
import { bootstrapHosts, HOST_STEPS, pendingTasks, summarizeSteps, type HostRun, type HostSetup } from "./tooling-bootstrap.js";
import type { HostName } from "./host-names.js";
import { writeInstallLog } from "./install-log.js";
import { handoffStateRoot, recordHandoffs } from "./tooling-handoffs.js";

const USAGE = "agent-plugin project bootstrap --input <accepted-plan.json> [--apply] [--resume <request.json>] [--project <directory>] [--log <path>]";
const pairs = (args: readonly string[]): readonly string[] => args.filter((entry) => entry !== "--apply");
const option = (args: readonly string[], key: string): string | undefined => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const valid = (args: readonly string[]): boolean => args.filter((entry) => entry === "--apply").length <= 1
  && pairs(args).length % 2 === 0 && pairs(args).every((entry, index) => index % 2 === 0
    ? ["--input", "--resume", "--project", "--log"].includes(entry) : entry.length > 0 && !entry.startsWith("--"))
  && new Set(pairs(args).filter((_, index) => index % 2 === 0)).size === pairs(args).length / 2 && option(args, "--input") !== undefined;
const inputFile = (project: string, path: string): Promise<Result<unknown>> => readFile(resolve(project, path), "utf8").then(parseJson)
  .catch(() => fail("unreadable-input", "Bootstrap input could not be read.", "Preserve the accepted setup plan and original request; correct the input path and retry."));
const output = (io: CliIo, result: Result<unknown>, code = result.ok ? 0 : 1): number => {
  io.out(JSON.stringify(result, null, 2)); // fp-allow: no-void-return -- CLI output boundary
  return code;
};

/** Read-only planning is the default. --apply materializes only the user's accepted setup input. */
export const runTooling = (args: readonly string[], io: CliIo): Promise<number> => valid(args)
  ? runInput(args, io) : Promise.resolve(output(io, fail("usage", USAGE, "Provide one input plan; use --apply only after the user accepts its settings and installations.")));
const runInput = async (args: readonly string[], io: CliIo): Promise<number> => {
  const project = resolve(io.cwd(), option(args, "--project") ?? ".");
  const input = await inputFile(project, option(args, "--input") ?? "");
  const parsed = flatMap(input, parseBootstrap);
  const resumePath = option(args, "--resume");
  const request = resumePath === undefined ? ok(null) : await inputFile(project, resumePath).then((value) => flatMap(value, parseRequest));
  return !parsed.ok ? output(io, parsed) : !request.ok ? output(io, request)
    : execute(project, parsed.value, args.includes("--apply"), request.value, io, option(args, "--log"));
};
const execute = async (project: string, plan: AcceptedPlan, apply: boolean, request: Request | null, io: CliIo, logPath?: string): Promise<number> => {
  const environment = { claudeState: io.claudeState() };
  const ioFor = (host: HostName) => nodeToolingIO(project, forHost(plan, host), environment);
  const swept = apply ? await sweepSetupWrites(project, plan.python) : ok(project);
  const progress = (host: HostName | undefined, step: typeof TOOLING_STEPS[number]): void =>
    io.err(`[${host ?? "project"}] ${step}\n`); // fp-allow: no-void-return -- progress output boundary
  const result = swept.ok ? await bootstrapHosts(ioFor, apply, plan, apply ? progress : undefined)() : swept;
  return result.ok
    ? respond(project, plan, apply, request, io, apply ? await acquire(result.value, project, plan, ioFor) : result.value, logPath)
    : writeInstallLog(project, [{ type: "bootstrap-failure", failure: result.error }], logPath).then((log) => {
      io.out(JSON.stringify({ ...result, log }, null, 2)); // fp-allow: no-void-return -- CLI output boundary
      return 1;
    });
};

const refreshServer = async (run: HostRun, ioFor: (host: HostName) => ToolingIO): Promise<HostRun> => {
  const verify = run.tooling.steps.some((step) => step.step === "knowledge-server" && step.status === "action-required");
  const refreshed = verify ? await bootstrapTooling(ioFor(run.host), false, ["knowledge-server"])() : undefined;
  return refreshed?.ok ? { ...run, tooling: summarizeSteps(run.tooling.steps.map((step) =>
    step.step === "knowledge-server" ? refreshed.value.steps[0] ?? step : step)) } : run;
};

const acquire = async (setup: HostSetup, project: string, plan: AcceptedPlan, ioFor: (host: HostName) => ToolingIO): Promise<HostSetup> => {
  const candidates = setup.hosts.filter(({ tooling }) => tooling.steps.some((step) =>
    step.step === "host-discovery" && step.status === "ready")).map(({ host }) => host);
  const shared = await finishKnowledge(setup.project, project, plan, ioFor(plan.hosts[0]), candidates);
  const acquired = shared !== setup.project && shared.steps.some((step) => step.step === "knowledge-content" && step.status === "ready");
  return { ...setup, project: shared, hosts: acquired ? await Promise.all(setup.hosts.map((run) => refreshServer(run, ioFor))) : setup.hosts };
};

const reportExit = (report: ToolingReport, apply: boolean): number => {
  const codes = report.steps.flatMap((step) => step.status === "ready" ? [] : [exitCodeOf(recoveryFor(step.step, step.failure.code).onFailure.class)]);
  return !apply ? 0 : codes.includes(1) ? 1 : codes.includes(2) ? 2 : 0;
};
const classified = (report: ToolingReport) => ({ ...report, steps: report.steps.map((step) => step.status === "ready" ? step
  : { ...step, failure: { ...step.failure, class: recoveryFor(step.step, step.failure.code).onFailure.class } }) });
const backupPaths = (project: string): Promise<readonly string[]> => readdir(join(project, ".upf-tools", "bin"), { withFileTypes: true })
  .then((entries) => entries.filter((entry) => entry.isFile() && entry.name.startsWith("agent-plugin.upf-backup-"))
    .map((entry) => join(project, ".upf-tools", "bin", entry.name)).sort())
  .catch(() => []);
const fullHost = (run: HostRun) => HOST_STEPS.every((step) => run.tooling.steps.some((entry) => entry.step === step));
const respond = async (project: string, plan: AcceptedPlan, apply: boolean, request: Request | null, io: CliIo,
  setup: HostSetup, logPath?: string): Promise<number> => {
  const report = summarizeSteps([...setup.project.steps, ...setup.hosts.flatMap(({ tooling }) => tooling.steps)]);
  const backups = await backupPaths(project);
  const complete = TOOLING_STEPS.every((step) => plan.steps.includes(step));
  const handoffs = apply ? pendingTasks(report) : [];
  const handoff = handoffs.length === 0 ? ok(null) : await recordHandoffs(project, handoffStateRoot(), plan, handoffs);
  if (!handoff.ok) io.err(`${handoff.error.message} ${handoff.error.recovery}\n`);
  const common = { mode: apply ? "apply" : "plan", host: plan.hosts[0], workflows: plan.workflows, tooling: classified(report), request,
    project: classified(setup.project), backups, hosts: setup.hosts.map((run) => ({ ...run, tooling: classified(run.tooling), status: run.tooling.status === "action-required" || fullHost(run) ? run.tooling.status : "not-verified" })),
    handoffs, pendingTasks: handoff.ok ? handoff.value : null, events: setup.events,
    status: report.status === "action-required" || complete ? report.status : "not-verified",
    next: !handoff.ok ? handoff.error.recovery : handoffs.includes("knowledge-discovery") ? recoveryFor("knowledge-content", "knowledge-discovery-needed").onFailure.instruction
      : report.status === "action-required" ? "Complete the reported recoveries and rerun this accepted plan. Successful capabilities are reused."
        : complete ? "Selected tooling is verified. Continue the original work." : "The selected steps passed. Other setup capabilities were not verified." };
  const resumed = apply && request !== null && report.status === "ready" && report.steps.length > 0
    ? await resumeTooling(report, operate(nodeProjectIO(project), request))() : null;
  const result = resumed === null ? ok(common) : resumed.ok ? ok({ ...common, ...resumed.value }) : resumed;
  const stored = await writeInstallLog(project, [
    ...setup.events.map((event) => ({ type: "recovery", ...event })),
    { type: "bootstrap", mode: common.mode, status: common.status, project: common.project, hosts: common.hosts, handoffs: common.handoffs },
  ], logPath);
  return output(io, result.ok ? ok({ ...result.value, log: stored }) : result, handoff.ok ? reportExit(report, apply) : 1);
};

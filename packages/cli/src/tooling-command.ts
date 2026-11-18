import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bootstrapTooling, fail, flatMap, nodeProjectIO, ok, operate, parseJson, parseRequest, resumeTooling, type Request, type Result } from "@agent-plugins/project";
import type { CliIo } from "./index.js";
import { forHost, parseBootstrap, type AcceptedPlan } from "./tooling-input.js";
import { nodeToolingIO } from "./tooling-node.js";

const USAGE = "agent-plugin project bootstrap --input <accepted-plan.json> [--apply] [--resume <request.json>] [--project <directory>]";
const pairs = (args: readonly string[]): readonly string[] => args.filter((entry) => entry !== "--apply");
const option = (args: readonly string[], key: string): string | undefined => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const valid = (args: readonly string[]): boolean => args.filter((entry) => entry === "--apply").length <= 1
  && pairs(args).length % 2 === 0 && pairs(args).every((entry, index) => index % 2 === 0
    ? ["--input", "--resume", "--project"].includes(entry) : entry.length > 0 && !entry.startsWith("--"))
  && new Set(pairs(args).filter((_, index) => index % 2 === 0)).size === pairs(args).length / 2 && option(args, "--input") !== undefined;
const inputFile = (project: string, path: string): Promise<Result<unknown>> => readFile(resolve(project, path), "utf8").then(parseJson)
  .catch(() => fail("unreadable-input", "Bootstrap input could not be read.", "Preserve the accepted setup plan and original request; correct the input path and retry."));
const output = (io: CliIo, result: Result<unknown>): number => {
  io.out(JSON.stringify(result, null, 2)); // fp-allow: no-void-return -- CLI output boundary
  return result.ok ? 0 : 1;
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
    : execute(project, parsed.value, args.includes("--apply"), request.value, io);
};
const execute = async (project: string, plan: AcceptedPlan, apply: boolean, request: Request | null, io: CliIo): Promise<number> => {
  const result = await bootstrapTooling(nodeToolingIO(project, forHost(plan, plan.hosts[0]), { claudeState: io.claudeState() }), apply, plan.steps)();
  return !result.ok ? output(io, result) : !apply || request === null || result.value.status !== "ready"
    ? output(io, ok({ mode: apply ? "apply" : "plan", host: plan.hosts[0], hosts: plan.hosts, workflows: plan.workflows,
      tooling: result.value, request, next: result.value.status === "ready" ? "Selected tooling is verified. Continue the original work."
        : "Complete the reported recoveries and rerun this accepted plan. Successful capabilities are reused." }))
    : resumeTooling(result.value, operate(nodeProjectIO(project), request))().then((resumed) => output(io, resumed));
};

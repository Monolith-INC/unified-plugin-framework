import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fail, flatMap, nodeProjectIO, ok, operate, parseJson, parseRequest, setup, type ProjectIO, type ProjectReply, type Request, type Result } from "@agent-plugins/project";
import type { CliIo } from "./index.js";
import { runTooling } from "./tooling-command.js";
import { readLastInstallLog } from "./install-log.js";

const USAGE = "agent-plugin project describe | status [--project <directory>] | request --input <request.json> | setup --input <answers.json> [--resume <request.json>] [--project <directory>]";
const option = (args: readonly string[], name: string): string | undefined => args[args.indexOf(name) + 1];
const argument = (args: readonly string[], name: string): string | undefined => args.includes(name) ? option(args, name) : undefined;

// Input-file boundary keeps prose and JSON out of shell interpolation.
const readInput = (root: string, path: string | undefined): Promise<Result<unknown>> => path === undefined
  ? Promise.resolve(fail("missing-input", USAGE, "Provide --input with a JSON file containing the accepted choices or operation."))
  : readFile(resolve(root, path), "utf8").then(parseJson).catch(() => fail("unreadable-input", "The input file could not be read.", "Correct its path and repeat the command."));
const readResume = (root: string, path: string | undefined): Promise<Result<Request | null>> => path === undefined
  ? Promise.resolve(ok(null)) : readInput(root, path).then((raw) => flatMap(raw, parseRequest));

const respond = (io: CliIo, result: Result<ProjectReply>): number => {
  io.out(JSON.stringify(result, null, 2)); // fp-allow: no-void-return -- external CLI output contract
  return result.ok ? 0 : 1;
};

/** CLI edge: both bootstrap and ordinary operations use the same project service. */
const requestCommand = (root: string, input: string | undefined, runtime: ProjectIO, io: CliIo): Promise<number> =>
  readInput(root, input).then((raw) => requestResult(flatMap(raw, parseRequest), runtime, io));
const requestResult = (request: Result<Request>, runtime: ProjectIO, io: CliIo): number | Promise<number> => {
  switch (request.ok) {
    case false: return respond(io, request);
    case true: return operate(runtime, request.value)().then((reply) => respond(io, reply));
  }
};
const setupResult = (answers: Result<unknown>, request: Result<Request | null>, runtime: ProjectIO, io: CliIo): number | Promise<number> => {
  switch (answers.ok) {
    case false: return respond(io, answers);
    case true: return acceptedSetup(answers.value, request, runtime, io);
  }
};
const acceptedSetup = (answers: unknown, request: Result<Request | null>, runtime: ProjectIO, io: CliIo): number | Promise<number> => {
  switch (request.ok) {
    case false: return respond(io, request);
    case true: return setup(runtime, answers, request.value)().then((reply) => respond(io, reply));
  }
};
const setupCommand = (root: string, args: readonly string[], runtime: ProjectIO, io: CliIo): Promise<number> =>
  Promise.all([readInput(root, argument(args, "--input")), readResume(root, argument(args, "--resume"))])
    .then(([answers, request]) => setupResult(answers, request, runtime, io));

const validArgs = (args: readonly string[]): boolean => args.slice(1).length % 2 === 0
  && args.slice(1).every((entry, index) => index % 2 === 0 ? ["--input", "--resume", "--project"].includes(entry) : entry !== "" && !entry.startsWith("--"))
  && new Set(args.slice(1).filter((_, index) => index % 2 === 0)).size === args.slice(1).length / 2
  && (args[0] === "setup" || !args.includes("--resume")) && (args[0] !== "describe" || !args.includes("--input"));

export const runProject = (args: readonly string[], io: CliIo): Promise<number> => args[0] === "bootstrap" ? runTooling(args.slice(1), io)
  : validArgs(args) ? runAction(args, io) : Promise.resolve(respond(io, fail("usage", USAGE, "Correct the option names and provide one value for each option.")));
const runAction = (args: readonly string[], io: CliIo): Promise<number> => {
  const root = resolve(io.cwd(), argument(args, "--project") ?? ".");
  const runtime = nodeProjectIO(root);
  switch (args[0]) {
    case "describe": return operate(runtime, null)().then((reply) => respond(io, reply));
    case "status": return readLastInstallLog(root).then((log) => {
      io.out(JSON.stringify({ ok: true, value: { log } }, null, 2)); // fp-allow: no-void-return -- CLI output boundary
      return 0;
    });
    case "request": return requestCommand(root, argument(args, "--input"), runtime, io);
    case "setup": return setupCommand(root, args, runtime, io);
    default: return Promise.resolve(respond(io, fail("usage", USAGE, "Choose describe, request or setup.")));
  }
};

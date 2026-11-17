import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fail, ok, type Result } from "@agent-plugins/project";

/** Process boundary: argv is passed directly; output and credentials never enter failure messages. */
export const command = (program: string, args: readonly string[], cwd: string, timeout = 120_000): Promise<Result<string>> =>
  new Promise((resolve) => {
    const child = spawn(program, [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = collect(child.stdout[Symbol.asyncIterator](), []);
    child.stderr.resume();
    const timer = setTimeout(() => child.kill(), timeout);
    child.on("error", () => { clearTimeout(timer); resolve(processFailure(program)); });
    child.on("close", (code) => { clearTimeout(timer); stdout.then((bytes) => resolve(code === 0 ? ok(bytes) : processFailure(program))).catch(() => resolve(processFailure(program))); });
  });
const collect = async (stream: AsyncIterator<Buffer>, chunks: readonly Buffer[]): Promise<string> => {
  const next = await stream.next();
  return next.done ? Buffer.concat(chunks).toString("utf8") : collect(stream, [...chunks, next.value]);
};
const processFailure = (program: string): Result<never> => fail("tool-command-failed", `The ${program.split(/[\\/]/).at(-1) ?? "tool"} command did not finish successfully.`,
  "Check the executable, network and permissions; preserve completed setup and rerun the affected step. No automatic retry was made.");

/** Fresh host protocol connection; no model turn, user thread or inference cost. */
export const hostRequest = (cwd: string, request: { readonly method: string; readonly params: unknown }): Promise<Result<unknown>> => {
  const child = spawn("codex", ["app-server", "--stdio"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  child.stderr.resume();
  child.stdin.on("error", () => child.stdout.destroy());
  child.on("error", () => child.stdout.destroy());
  const timer = setTimeout(() => child.kill(), 25_000);
  const send = (value: unknown): boolean => child.stdin.write(`${JSON.stringify(value)}\n`);
  const response = async (id: number): Promise<unknown> => {
    const line = await lines.next();
    const value: unknown = line.done ? null : JSON.parse(line.value);
    return value !== null && typeof value === "object" && "id" in value && value.id === id ? value
      : line.done ? Promise.reject(new Error("host-ended")) : response(id);
  };
  send({ id: 1, method: "initialize", params: { clientInfo: { name: "upf-bootstrap", version: "1.0.0" } } });
  return response(1).then(() => {
    send({ method: "initialized", params: {} });
    send({ id: 2, ...request });
    return response(2);
  }).then(ok).catch(() => fail("host-unavailable", "Fresh host verification could not finish.",
    "Restore Codex state access and trusted-project configuration, then repeat bootstrap verification; configuration is preserved."))
    .finally(() => { clearTimeout(timer); child.kill(); });
};

import { spawn, type ChildProcess } from "node:child_process";
import { addAbortListener, once } from "node:events";
import { createInterface } from "node:readline";
import { Transform } from "node:stream";
import { fail, ok, type Result } from "@agent-plugins/project";

const DEFAULT_LIMIT = 4 * 1024 * 1024;
const STDERR_LIMIT = 4 * 1024;
const DEFAULT_GRACE = 250;
interface ProcessOptions {
  readonly timeout: number;
  readonly limit?: number;
  readonly grace?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/** Share an explicit allowlist without capturing unrelated credentials from the caller. */
export const selectEnvironment = (environment: NodeJS.ProcessEnv, keys: readonly string[]): NodeJS.ProcessEnv =>
  Object.fromEntries(keys.flatMap((key) => environment[key] === undefined ? [] : [[key, environment[key]]]));

const diagnosticLine = (text: string): string =>
  text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1)?.slice(0, 240) ?? "";
const failure = (code: string, program: string, reason: string, detail = ""): Result<never> =>
  fail(code, `The ${program.split(/[\\/]/).at(-1) ?? "tool"} command ${reason}${detail === "" ? "." : `: ${detail}`}`,
    "Check the executable, environment, and permissions, then rerun the affected setup step.");
const processFailure = (program: string, detail = ""): Result<never> => failure("tool-command-failed", program, "did not finish successfully", detail);
const signalGroup = (child: ChildProcess, signal: NodeJS.Signals): boolean => {
  try {
    return process.platform !== "win32" && child.pid !== undefined ? process.kill(-child.pid, signal) : child.kill(signal);
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ESRCH";
  }
};

class OutputLimit extends Error {}
const bounded = (limit: number): Transform => {
  const progress = { bytes: 0 };
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const size = progress.bytes + chunk.length;
      Object.assign(progress, { bytes: size }); // Byte accounting belongs to the stream boundary.
      return size > limit ? callback(new OutputLimit()) : callback(null, chunk);
    },
  });
};

type ToolProcess = ReturnType<typeof start>;
const start = (program: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv | undefined) =>
  spawn(program, [...args], { cwd, env, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });

const collectCapped = (stream: NodeJS.ReadableStream): (() => string) => {
  const state = { chunks: [] as Buffer[], bytes: 0 };
  stream.on("data", (chunk: Buffer) => {
    const remaining = STDERR_LIMIT - state.bytes;
    if (remaining <= 0) return;
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    state.chunks.push(slice); // Bounded stderr capture belongs to the stream edge.
    state.bytes += slice.length;
  });
  stream.on("error", () => undefined);
  return () => Buffer.concat(state.chunks).toString("utf8");
};

/** One supervisor owns process-group termination, timing, and pipe cleanup for commands and protocols. */
const runProcess = <A>(program: string, args: readonly string[], cwd: string, options: ProcessOptions,
  use: (child: ToolProcess, output: Transform, stderrText: () => string) => Promise<Result<A>>): Promise<Result<A>> => new Promise((settle) => {
  const child = start(program, args, cwd, options.env);
  const output = child.stdout.pipe(bounded(options.limit ?? DEFAULT_LIMIT));
  const stderrText = collectCapped(child.stderr);
  const expired = new AbortController();
  const finished = new AbortController();
  const stop = (): boolean => {
    const killed = signalGroup(child, "SIGKILL");
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    output.destroy();
    return killed;
  };
  const subscription = addAbortListener(expired.signal, () => {
    signalGroup(child, "SIGTERM");
    setTimeout(() => {
      finished.abort();
      stop();
      settle(failure("tool-timeout", program, "exceeded its time limit"));
    }, options.grace ?? DEFAULT_GRACE);
  });
  const timer = setTimeout(() => expired.abort(), options.timeout);
  const finish = (result: Result<A>): boolean => {
    if (expired.signal.aborted || finished.signal.aborted) return false;
    finished.abort();
    clearTimeout(timer);
    subscription[Symbol.dispose]();
    settle(result);
    return stop();
  };
  child.stdin.on("error", () => false); // A command may exit without consuming stdin.
  child.once("error", () => finish(processFailure(program)));
  output.once("error", (error) => finish(error instanceof OutputLimit
    ? failure("tool-command-failed", program, "exceeded its output limit") : processFailure(program)));
  Promise.resolve().then(() => use(child, output, stderrText)).then(finish, () => finish(processFailure(program, diagnosticLine(stderrText()))));
});

const collect = async (stream: AsyncIterator<Buffer>, chunks: readonly Buffer[]): Promise<string> => {
  const next = await stream.next();
  return next.done ? Buffer.concat(chunks).toString("utf8") : collect(stream, [...chunks, next.value]);
};

/** Before a deadline, stdout is capped and stderr is bounded for diagnostics. Omit env to inherit it. */
/** A time limit stretched for a retry after a timeout; `patience` is 1 on every first run. */
export const scaled = (milliseconds: number, patience = 1): number => milliseconds * patience;
export const command = (program: string, args: readonly string[], cwd: string, timeout = 120_000, env?: NodeJS.ProcessEnv): Promise<Result<string>> =>
  commandOutput(program, args, cwd, { timeout, ...(env === undefined ? {} : { env }) });

const commandOutput = (program: string, args: readonly string[], cwd: string, options: ProcessOptions): Promise<Result<string>> =>
  runProcess(program, args, cwd, options, async (child, output, stderrText) => {
    child.stdin.end();
    const [[code], text] = await Promise.all([once(child, "close"), collect(output[Symbol.asyncIterator](), [])]);
    return code === 0 ? ok(text) : processFailure(program, diagnosticLine(stderrText()) || diagnosticLine(text));
  });

export const boundedOutput = (program: string, args: readonly string[], cwd: string, timeout: number, env: NodeJS.ProcessEnv): Promise<Result<string>> =>
  commandOutput(program, args, cwd, { timeout, env, limit: 32_768 });

/** Runs step over items in order and stops on the first failure. */
export const sequence = <A>(items: readonly A[], step: (item: A) => Promise<Result<unknown>>, done: string): Promise<Result<string>> => {
  const [item, ...rest] = items;
  return item === undefined ? Promise.resolve(ok(done)) : step(item).then((result) => result.ok ? sequence(rest, step, done) : result);
};

const replyWithId = async (lines: AsyncIterator<string>, id: number): Promise<unknown> => {
  const line = await lines.next();
  const value: unknown = line.done ? null : JSON.parse(line.value);
  return value !== null && typeof value === "object" && "id" in value && value.id === id ? value
    : line.done ? Promise.reject(new Error("host-ended")) : replyWithId(lines, id);
};

/** Probe the host protocol without starting a model turn or user thread. */
export const codexAppServerRequest = (cwd: string, request: { readonly method: string; readonly params: unknown }, timeout = 25_000, program = "codex"): Promise<Result<unknown>> =>
  runProcess(program, ["app-server", "--stdio"], cwd, { timeout }, async (child, output) => {
    const lines = createInterface({ input: output })[Symbol.asyncIterator]();
    const send = (value: unknown): boolean => child.stdin.write(`${JSON.stringify(value)}\n`);
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "upf-bootstrap", version: "1.0.0" },
      capabilities: { experimentalApi: false, requestAttestation: false } } });
    await replyWithId(lines, 1);
    send({ method: "initialized", params: {} });
    send({ id: 2, ...request });
    return ok(await replyWithId(lines, 2));
  }).then((result) => result.ok || result.error.code !== "tool-command-failed" ? result
    : fail("host-unavailable", "Fresh host verification could not finish.",
      "Restore Codex state access and trusted-project configuration, then repeat bootstrap verification."));

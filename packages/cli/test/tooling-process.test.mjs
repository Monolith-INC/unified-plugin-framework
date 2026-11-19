import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { boundedOutput, codexAppServerRequest, command, selectEnvironment } from "../dist/tooling-process.js";

test("a hung child reports a timeout and is stopped", { timeout: 5000 }, async () => {
  const result = await command(process.execPath, ["-e", "setInterval(() => {}, 1000)"], tmpdir(), 150);
  assert.equal(result.error.code, "tool-timeout");
});

test("the supervisor kills an ignored stop signal and a grandchild holding stdout", {
  skip: process.platform === "win32", timeout: 7000,
}, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "upf-process-"));
  const ready = join(cwd, "running");
  const leaked = join(cwd, "escaped-deadline");
  const grandchild = `
    process.on("SIGTERM", () => {});
    const fs = require("node:fs");
    fs.writeFileSync(${JSON.stringify(ready)}, "running");
    setTimeout(() => fs.writeFileSync(${JSON.stringify(leaked)}, "escaped"), 1200);
  `;
  const parent = `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}],
    { stdio: ["ignore", 1, "ignore"] }).unref();`;
  const result = await command(process.execPath, ["-e", parent], cwd, 450);
  assert.equal(result.error.code, "tool-timeout");
  assert.equal(await readFile(ready, "utf8"), "running");
  await setTimeout(850);
  await assert.rejects(readFile(leaked), { code: "ENOENT" });
});

test("a chatty child is cut off and private environment entries are omitted", async () => {
  const result = await boundedOutput(process.execPath, ["-e", 'process.stdout.write("x".repeat(65536))'], tmpdir(), 1000, {});
  assert.equal(result.error.code, "tool-command-failed");
  assert.match(result.error.message, /output limit/);
  const env = selectEnvironment({ INCLUDE: "keep", PRIVATE_VALUE: "omit" }, ["INCLUDE"]);
  const shown = await command(process.execPath, ["-e", "process.stdout.write(JSON.stringify(process.env))"], tmpdir(), 1000, env);
  // macOS adds its text-encoding variable to every child process; nothing from the parent may leak.
  const { __CF_USER_TEXT_ENCODING: _system, ...passed } = JSON.parse(shown.value);
  assert.deepEqual(passed, { INCLUDE: "keep" });
});

test("the app-server deadline bounds an unresponsive protocol", { skip: process.platform === "win32", timeout: 5000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "upf-app-server-"));
  await writeFile(join(cwd, "codex"), `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`, { mode: 0o700 });
  const priorPath = process.env.PATH;
  process.env.PATH = cwd;
  try {
    const result = await codexAppServerRequest(cwd, { method: "skills/list", params: {} }, 150);
    assert.equal(result.error.code, "tool-timeout");
  } finally {
    process.env.PATH = priorPath;
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { finishKnowledge } from "../dist/tooling-acquisition.js";
import { boundedOutput } from "../dist/tooling-process.js";

test("acquisition skips a signed-out host and publishes its marker only after verification", { skip: process.platform === "win32" }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), "upf-acquisition-"));
  const project = join(fixture, "project");
  const bin = join(fixture, "bin");
  const runtime = join(project, ".project-knowledge/runtime/bin");
  const root = join(project, "knowledge");
  await Promise.all([bin, runtime, root].map((path) => mkdir(path, { recursive: true })));
  const invocation = join(fixture, "invocation.json");
  const verification = join(fixture, "verified");
  const marker = join(root, ".upf-discovery-complete");
  await writeFile(join(bin, "codex"), `#!${process.execPath}
if (process.argv[2] === "--version") console.log("codex-cli 0.166.0");
else process.exit(1);
`, { mode: 0o700 });
  await writeFile(join(bin, "claude"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") console.log("2.1.318 (Claude Code)");
else if (args[0] === "auth") console.log('{"loggedIn":true}');
else {
  fs.writeFileSync(${JSON.stringify(invocation)}, JSON.stringify({ cwd: process.cwd(), args }));
  console.log("UPF_DISCOVERY_COMPLETE");
}
`, { mode: 0o700 });
  await writeFile(join(runtime, "upf-project-knowledge"), `#!${process.execPath}
const fs = require("node:fs");
if (!process.argv.includes("--verify") || fs.existsSync(${JSON.stringify(marker)})) process.exit(1);
fs.writeFileSync(${JSON.stringify(verification)}, "verified");
`, { mode: 0o700 });
  const report = { status: "action-required", steps: [
    ...["knowledge-runtime", "knowledge-settings", "host-discovery"].map((step) => ({ step, status: "ready", evidence: "fixture" })),
    { step: "knowledge-content", status: "action-required", failure: { code: "knowledge-discovery-needed" } },
  ] };
  const originalPath = process.env.PATH;
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  process.env.PATH = bin;
  try {
    const plan = { hosts: ["codex", "claude"], python, knowledge: { knowledgeRoot: "knowledge" }, consent: { headlessDiscovery: true } };
    const result = await finishKnowledge(report, project, plan, {});
    assert.equal(result.status, "ready");
    const recorded = JSON.parse(await readFile(invocation, "utf8"));
    assert.notEqual(recorded.cwd, project);
    assert.match(recorded.cwd, /upf-discovery-/);
    assert.ok(recorded.args.includes("--strict-mcp-config"));
    assert.equal(await readFile(verification, "utf8"), "verified");
    assert.equal(await readFile(marker, "utf8"), "verified\n");
  } finally {
    process.env.PATH = originalPath;
  }
});

test("a hung discovery command settles at its deadline", { skip: process.platform === "win32" }, async () => {
  const result = await boundedOutput(process.execPath, ["-e", "setInterval(() => {}, 1000)"], tmpdir(), 150, {});
  assert.equal(result.ok, false);
});

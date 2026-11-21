import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { finishKnowledge } from "../dist/tooling-acquisition.js";
import { boundedOutput } from "../dist/tooling-process.js";

test("acquisition skips a signed-out host and publishes its marker only after zero-MCP catalog verification", { skip: process.platform === "win32" }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), "upf-acquisition-"));
  const project = join(fixture, "project");
  const bin = join(fixture, "bin");
  const scriptsDir = join(project, ".upf-tools/plugins/monolithic-agent-knowledge-store/source/scripts");
  const root = join(project, "Project_Knowledge");
  await Promise.all([bin, scriptsDir, root].map((path) => mkdir(path, { recursive: true })));
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
  await writeFile(join(scriptsDir, "query.py"), `import sys, pathlib
if len(sys.argv) < 2 or sys.argv[1] != "catalog" or "--project" not in sys.argv or "--root" not in sys.argv or pathlib.Path(${JSON.stringify(marker)}).exists():
    raise SystemExit(1)
pathlib.Path(${JSON.stringify(verification)}).write_text("verified")
print("id\\ttier\\ttitle\\noverview\\t1\\tProject overview")
`, { mode: 0o700 });
  const report = { status: "action-required", steps: [
    ...["knowledge-runtime", "knowledge-settings", "host-discovery"].map((step) => ({ step, status: "ready", evidence: "fixture" })),
    { step: "knowledge-content", status: "action-required", failure: { code: "knowledge-discovery-needed" } },
  ] };
  const originalPath = process.env.PATH;
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  process.env.PATH = bin;
  try {
    const plan = { hosts: ["codex", "claude"], python, knowledge: { knowledgeRoot: "Project_Knowledge" }, consent: { headlessDiscovery: true } };
    const result = await finishKnowledge(report, project, plan, {});
    assert.equal(result.status, "ready");
    const recorded = JSON.parse(await readFile(invocation, "utf8"));
    assert.notEqual(recorded.cwd, project);
    assert.match(recorded.cwd, /upf-discovery-/);
    assert.ok(!recorded.args.includes("--strict-mcp-config"));
    assert.match(recorded.args.at(-1), /query\.py.*curate/);
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

test("when every pinned host is signed out, discovery reports sign-in as the person's action", { skip: process.platform === "win32" }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), "upf-acquisition-signin-"));
  const project = join(fixture, "project");
  const bin = join(fixture, "bin");
  await Promise.all([bin, join(project, ".upf-tools/plugins/monolithic-agent-knowledge-store/source/scripts"), join(project, "Project_Knowledge")].map((path) => mkdir(path, { recursive: true })));
  await writeFile(join(bin, "codex"), `#!${process.execPath}
if (process.argv[2] === "--version") console.log("codex-cli 0.166.0");
else process.exit(1);
`, { mode: 0o700 });
  const report = { status: "action-required", steps: [
    ...["knowledge-runtime", "knowledge-settings", "host-discovery"].map((step) => ({ step, status: "ready", evidence: "fixture" })),
    { step: "knowledge-content", status: "action-required", failure: { code: "knowledge-discovery-needed" } },
  ] };
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  const plan = { hosts: ["codex"], python, knowledge: { knowledgeRoot: "Project_Knowledge" }, consent: { headlessDiscovery: true } };
  const result = await finishKnowledge(report, project, plan, {}, ["codex"], new Map(), { PATH: bin });
  const content = result.steps.find(({ step }) => step === "knowledge-content");
  assert.equal(content.failure.code, "host-sign-in-needed");
  assert.match(content.failure.message, /not signed in: Codex/);
  assert.match(content.failure.recovery, /Sign in to the assistant/);
});

test("acquisition accepts newer compatible host CLI versions and skips older ones", { skip: process.platform === "win32" }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), "upf-acquisition-semver-"));
  const project = join(fixture, "project");
  const bin = join(fixture, "bin");
  const scriptsDir = join(project, ".upf-tools/plugins/monolithic-agent-knowledge-store/source/scripts");
  const root = join(project, "Project_Knowledge");
  await Promise.all([bin, scriptsDir, root].map((path) => mkdir(path, { recursive: true })));
  await writeFile(join(bin, "codex"), `#!${process.execPath}
if (process.argv[2] === "--version") console.log("codex-cli 0.150.0");
else process.exit(1);
`, { mode: 0o700 });
  await writeFile(join(bin, "claude"), `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "--version") console.log("2.1.327 (Claude Code)");
else if (args[0] === "auth") console.log('{"loggedIn":true}');
else console.log("UPF_DISCOVERY_COMPLETE");
`, { mode: 0o700 });
  await writeFile(join(scriptsDir, "query.py"), `import sys
if len(sys.argv) < 2 or sys.argv[1] != "catalog":
    raise SystemExit(1)
print("id\\ttier\\ttitle\\nidentity/purpose\\t1\\tPurpose")
`, { mode: 0o700 });
  const report = { status: "action-required", steps: [
    ...["knowledge-runtime", "knowledge-settings", "host-discovery"].map((step) => ({ step, status: "ready", evidence: "fixture" })),
    { step: "knowledge-content", status: "action-required", failure: { code: "knowledge-discovery-needed" } },
  ] };
  const python = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
  const plan = { hosts: ["codex", "claude"], python, knowledge: { knowledgeRoot: "Project_Knowledge" }, consent: { headlessDiscovery: true } };
  const result = await finishKnowledge(report, project, plan, {}, ["codex", "claude"], new Map(), { PATH: bin });
  assert.equal(result.status, "ready");
});

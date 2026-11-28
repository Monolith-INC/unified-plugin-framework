import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const command = (args) => spawnSync(process.execPath, [cli, "design-handoff", ...args], { encoding: "utf8" });
const response = (args) => {
  const result = command(args);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const fixture = (context) => {
  const run = mkdtempSync(join(tmpdir(), "upf-visual-"));
  context.after(() => rmSync(run, { recursive: true, force: true }));
  const design = join(run, "DESIGN.md");
  const experience = join(run, "EXPERIENCE.md");
  writeFileSync(design, "---\nstatus: draft\n---\n\n## Layout & Spacing\n\nKeep existing layout notes.\n\n## Components\n\nExisting component.\n");
  writeFileSync(experience, "---\nstatus: draft\n---\n\n## Key Flows\n\nExisting flow.\n");
  return { run, design, experience };
};
const input = (run, name, value) => {
  const path = join(run, name + ".json");
  writeFileSync(path, JSON.stringify(value));
  return path;
};

test("rejects experimental routing and recording without changing the workspace", (context) => {
  const { run } = fixture(context);
  const mock = join(run, "mock.html");
  writeFileSync(mock, "<p>Pickup details</p>");
  const route = command(["provider", "ready"]);
  assert.equal(route.status, 1);
  assert.match(route.stderr, /Unknown handoff operation/);
  const record = command(["record", run, input(run, "options", { provider: "product-design", paths: [mock] })]);
  assert.equal(record.status, 1);
  assert.match(record.stderr, /Supply provider/);
  assert.deepEqual(response(["inspect", run]), { status: "empty" });
});

test("new processes resume the displayed third option and update both BMAD documents once", (context) => {
  const { run, design, experience } = fixture(context);
  const names = ["owl", "fox", "bear"];
  const paths = names.map((name) => join(run, name + ".png"));
  paths.forEach((path, index) => writeFileSync(path, names[index]));
  const recorded = response(["record", run, input(run, "options", { provider: "bmad", paths })]);
  paths.forEach((path) => rmSync(path));
  const resumed = response(["inspect", run]);
  assert.deepEqual(resumed, recorded);
  assert.deepEqual(resumed.options.map(({ number }) => number), [1, 2, 3]);
  const selected = response(["select", run, "3"]);
  assert.equal(readFileSync(join(run, selected.path), "utf8"), "bear");
  const decisions = input(run, "decisions", { design: "Place the amber action above the book.", experience: "Tap to show the code. [ASSUMPTION] Reveal it in place." });
  const finish = ["finish", run, decisions];
  const beforeExperience = readFileSync(experience, "utf8");
  response(finish);
  const stateFile = join(run, ".upf-design-handoff", "state.json");
  const saved = JSON.parse(readFileSync(stateFile, "utf8"));
  writeFileSync(stateFile, JSON.stringify({ ...saved, status: "writing" }));
  writeFileSync(experience, beforeExperience);
  rmSync(decisions);
  response(["finish", run]);
  response(["finish", run]);
  [design, experience].forEach((path) => {
    const body = readFileSync(path, "utf8");
    assert.equal(body.split(selected.path).length, 2);
    assert.match(body, /Existing|existing/);
  });
  assert.match(readFileSync(design, "utf8"), /amber action[\s\S]+## Components/);
  assert.match(readFileSync(experience, "utf8"), /Tap to show the code/);
  assert.equal(response(["inspect", run]).status, "finished");
  assert.notEqual(command(["select", run, "1"]).status, 0);
});

test("BMAD HTML imports and links with recovery for changed files", (context) => {
  const { run, design, experience } = fixture(context);
  const mock = join(run, "bmad.html");
  writeFileSync(mock, "<p>Show pickup code</p>");
  const args = ["record", run, input(run, "options", { provider: "bmad", paths: [mock] })];
  const { options: [option] } = response(args);
  const saved = join(run, option.path);
  writeFileSync(saved, "changed");
  assert.notEqual(command(["select", run, "1"]).status, 0);
  assert.doesNotMatch(readFileSync(design, "utf8"), /imports\//);
  rmSync(saved);
  assert.notEqual(command(["select", run, "1"]).status, 0);
  response(args);
  const selection = response(["select", run, "1"]);
  assert.equal(readFileSync(join(run, selection.path), "utf8"), "<p>Show pickup code</p>");
  const finish = ["finish", run, input(run, "decisions", { design: "Use a single main button.", experience: "Reveal the pickup code." })];
  response(finish);
  assert.ok([design, experience].every((path) => readFileSync(path, "utf8").includes(selection.path)));
});

test("keeps BMAD section order and ignores headings inside code samples", (context) => {
  const { run, design } = fixture(context);
  writeFileSync(design, "---\nstatus: draft\n---\n\n## Typography\n\n```markdown\n## Layout & Spacing\n```\n\n## Components\n\nExisting components.\n");
  const path = join(run, "mock.html");
  writeFileSync(path, "<p>Hold details</p>");
  response(["record", run, input(run, "options", { provider: "bmad", paths: [path] })]);
  response(["select", run, "1"]);
  response(["finish", run, input(run, "decisions", { design: "Group details below the action.", experience: "Tap to reveal." })]);
  assert.match(readFileSync(design, "utf8"), /```markdown\n## Layout & Spacing\n```\n\n## Layout & Spacing[\s\S]+Group details[\s\S]+## Components/);
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "../dist/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const framework = join(repoRoot, "plugins/unified-plugin-framework");

const TOOLKIT_SKILLS = ["review-task", "review-story-preflight", "review-story-postflight", "review-feature", "review-setup"];

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
  return path;
};

const fakeToolkit = (skills) => {
  const root = mkdtempSync(join(tmpdir(), "upf-toolkit-"));
  writeJson(join(root, "plugin.json"), { name: "monolithic-code-review-toolkit", version: "0.6.0" });
  skills.map((skill) => {
    mkdirSync(join(root, "skills", skill), { recursive: true });
    writeFileSync(join(root, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: Test skill.\n---\n`);
    return skill;
  });
  return root;
};

const project = ({ knowledge, review } = { knowledge: "knowledge" }) => {
  const root = mkdtempSync(join(tmpdir(), "upf-project-"));
  mkdirSync(join(root, "knowledge"), { recursive: true });
  if (knowledge !== undefined) writeJson(join(root, ".project-knowledge.json"), { schemaVersion: 1, knowledgeRoot: knowledge });
  if (review !== undefined) writeJson(join(root, ".monolithic-code-review/sources.json"), { knowledge: { root: review } });
  return root;
};

const capture = (action) => {
  const original = { log: console.log, error: console.error };
  const output = { stdout: "", stderr: "" };
  console.log = (value) => {
    output.stdout += `${value}\n`;
  };
  console.error = (value) => {
    output.stderr += `${value}\n`;
  };
  try {
    return { exitCode: action(), ...output };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
};

const check = (args) => capture(() => run(["adapter-check", "code-review", "--framework", framework, ...args]));

test("adapter-check reports ready when the toolkit provides every mapped skill and the store is shared", () => {
  const result = check(["--plugin-root", fakeToolkit(TOOLKIT_SKILLS), "--project", project({ knowledge: "knowledge", review: "knowledge" })]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, workflow: "code-review", contractVersion: "1.0.0" });
});

test("adapter-check names the missing skill when the toolkit no longer provides it", () => {
  const result = check([
    "--plugin-root",
    fakeToolkit(TOOLKIT_SKILLS.filter((skill) => skill !== "review-feature")),
    "--project",
    project(),
  ]);
  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.step, "bound");
  assert.match(report.reason, /monolithic-code-review-toolkit:review-feature \(review-feature\)/);
});

test("adapter-check fails at installed when no plugin root is given", () => {
  const result = check(["--project", project()]);
  assert.equal(result.exitCode, 1);
  assert.equal(JSON.parse(result.stderr).step, "installed");
});

test("adapter-check fails at bound when the knowledge stores differ", () => {
  const result = check(["--plugin-root", fakeToolkit(TOOLKIT_SKILLS), "--project", project({ knowledge: "knowledge", review: "other" })]);
  assert.equal(result.exitCode, 1);
  assert.match(JSON.parse(result.stderr).reason, /differ/);
});

test("adapter-check rejects an unknown workflow and malformed arguments", () => {
  assert.equal(capture(() => run(["adapter-check", "discovery"])).exitCode, 2);
  assert.equal(capture(() => run(["adapter-check", "code-review", "--plugin-root"])).exitCode, 2);
  assert.equal(capture(() => run(["adapter-check", "code-review", "--colour", "red"])).exitCode, 2);
});

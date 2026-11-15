import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runAdapterCheck } from "../dist/adapter-check.js";
import { run } from "../dist/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const framework = join(repoRoot, "plugins/unified-plugin-framework");

const TOOLKIT_SKILLS = ["review-task", "review-story-preflight", "review-story-postflight", "review-feature", "review-setup"];

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
};

const fakeToolkit = (skills) => {
  const root = mkdtempSync(join(tmpdir(), "upf-toolkit-"));
  writeJson(join(root, "plugin.json"), { name: "monolithic-code-review-toolkit", version: "0.6.0" });
  skills.map((skill) => writeJson(join(root, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: Test skill.\n---\n`));
  return root;
};

/** `review`: a store path, `null`, "absent" (no sources.json), or { raw } for literal file text. */
const project = ({ review = "knowledge" } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "upf-project-"));
  mkdirSync(join(root, "knowledge"), { recursive: true });
  writeJson(join(root, ".project-knowledge.json"), { schemaVersion: 1, knowledgeRoot: "knowledge" });
  const sources = join(root, ".monolithic-code-review/sources.json");
  if (review !== "absent") writeJson(sources, review?.raw ?? { knowledge: { root: review } });
  return root;
};

/** A recording interpreter for the command's injected effects; reads go to the real temp files. */
const recordingIo = (base) => {
  const lines = { out: [], err: [] };
  return {
    lines,
    io: { ...base, out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) },
  };
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

test("adapter-check reports ready when the toolkit provides every mapped skill and shares the store", () => {
  const result = check(["--plugin-root", fakeToolkit(TOOLKIT_SKILLS), "--project", project()]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, workflow: "code-review", contractVersion: "1.0.0" });
});

test("adapter-check names the missing skill when the toolkit no longer provides it", () => {
  const result = check(["--plugin-root", fakeToolkit(TOOLKIT_SKILLS.filter((skill) => skill !== "review-feature")), "--project", project()]);
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

test("adapter-check fails at bound when the toolkit records no store or a different one", () => {
  const toolkit = fakeToolkit(TOOLKIT_SKILLS);
  [project({ review: "absent" }), project({ review: null }), project({ review: "other" })].map((root) => {
    const result = check(["--plugin-root", toolkit, "--project", root]);
    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).step, "bound");
    assert.match(JSON.parse(result.stderr).reason, /\.monolithic-code-review\/sources\.json \(knowledge\.root\)/);
    return root;
  });
});

test("adapter-check prints usage for --help", () => {
  const result = capture(() => run(["adapter-check", "--help"]));
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage: agent-plugin adapter-check/);
});

test("adapter-check rejects bad input with exit 2 instead of a readiness result", () => {
  const toolkit = fakeToolkit(TOOLKIT_SKILLS);
  const cases = [
    ["adapter-check", "toString", "--framework", framework],
    ["adapter-check", "discovery", "--framework", framework],
    ["adapter-check", "code-review"],
    ["adapter-check", "code-review", "--framework", framework, "--plugin-root"],
    ["adapter-check", "code-review", "--framework", framework, "--colour", "red"],
    ["adapter-check", "code-review", "--framework", join(repoRoot, "does-not-exist")],
    ["adapter-check", "code-review", "--framework", framework, "--plugin-root", join(repoRoot, "does-not-exist")],
    ["adapter-check", "code-review", "--framework", framework, "--plugin-root", toolkit, "--project", project({ review: { raw: "{not json" } })],
  ];
  cases.map((argv) => {
    assert.equal(capture(() => run(argv)).exitCode, 2, argv.join(" "));
    return argv;
  });
});

test("adapter-check reports a broken framework manifest as a configuration error", () => {
  const broken = mkdtempSync(join(tmpdir(), "upf-framework-"));
  writeJson(join(broken, "plugin.json"), {
    name: "unified-plugin-framework",
    version: "0.1.0",
    extensions: { "io.github.monolith-inc.upf": { onboardedPlugins: [{ name: "monolithic-code-review-toolkit" }] } },
  });
  const result = capture(() => run(["adapter-check", "code-review", "--framework", broken, "--project", project()]));
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /upf\.onboardedPlugin\.field\.required/);
});

test("adapter-check writes only through its injected console", () => {
  const recorded = recordingIo({
    readJson: () => ({ kind: "absent" }),
    inspectPlugin: () => ({ manifest: { name: "unified-plugin-framework", version: "0.1.0" }, diagnostics: [] }),
  });
  const exitCode = runAdapterCheck(recorded.io, ["code-review", "--framework", "/framework"], "/cwd");
  assert.equal(exitCode, 1);
  assert.deepEqual(recorded.lines.out, []);
  assert.equal(JSON.parse(recorded.lines.err[0]).step, "declared");
});

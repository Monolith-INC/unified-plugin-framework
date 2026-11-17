import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { runAdapterCheck } from "../dist/adapter-check.js";
import { run } from "../dist/index.js";
import {
  capture,
  digestOf,
  fakeToolkit,
  framework,
  frameworkPinning,
  project,
  recordingIo,
  repoRoot,
  TOOLKIT_SKILLS,
  writeJson,
} from "./onboarded-helpers.mjs";

const check = (args, root = framework) => capture(() => run(["adapter-check", "code-review", "--framework", root, ...args]));

/** adapter-check against a toolkit the framework's lock pins. */
const checkPinned = (toolkit, args) => check(["--plugin-root", toolkit, ...args], frameworkPinning(toolkit));

test("adapter-check reports ready when the pinned toolkit provides every mapped skill and shares the store", () => {
  const result = checkPinned(fakeToolkit(TOOLKIT_SKILLS), ["--project", project()]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, workflow: "code-review", contractVersion: "1.0.0" });
});

test("adapter-check names the missing skill when the toolkit no longer provides it", () => {
  const result = checkPinned(fakeToolkit(TOOLKIT_SKILLS.filter((skill) => skill !== "review-feature")), ["--project", project()]);
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
    const result = checkPinned(toolkit, ["--project", root]);
    assert.equal(result.exitCode, 1);
    assert.equal(JSON.parse(result.stderr).step, "bound");
    const report = JSON.parse(result.stderr);
    assert.match(report.reason, /\.monolithic-code-review\/sources\.json \(knowledge\.root\)/);
    assert.deepEqual(report.recovery.skill, { plugin: "monolithic-code-review-toolkit", skill: "review-setup" });
    assert.match(report.recovery.goal, /Set knowledge\.root in \.monolithic-code-review\/sources\.json to /);
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
    ["adapter-check", "planning", "--framework", framework],
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
    readPlugin: () => ({ ok: false, diagnostics: [{ severity: "error", code: "unused", message: "No plugin roots are read." }] }),
  });
  const exitCode = runAdapterCheck(recorded.io, ["code-review", "--framework", "/framework"], "/cwd");
  assert.equal(exitCode, 1);
  assert.deepEqual(recorded.lines.out, []);
  assert.equal(JSON.parse(recorded.lines.err[0]).step, "declared");
});

test("adapter-check names the plugin and both checksums when the installed toolkit differs from the lock", () => {
  const pinnedToolkit = fakeToolkit(TOOLKIT_SKILLS);
  const changed = fakeToolkit([...TOOLKIT_SKILLS, "review-extra"]);
  const result = check(["--plugin-root", changed, "--project", project()], frameworkPinning(pinnedToolkit));
  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.step, "installed");
  assert.match(report.reason, new RegExp(`monolithic-code-review-toolkit 0\\.6\\.0 \\(${digestOf(changed).slice(0, 12)}\\) is installed`));
  assert.match(report.reason, new RegExp(`pins 0\\.6\\.0 \\(${digestOf(pinnedToolkit).slice(0, 12)}\\)`));
});

test("adapter-check reports a malformed lock as a configuration error", () => {
  const toolkit = fakeToolkit(TOOLKIT_SKILLS);
  const root = frameworkPinning(toolkit);
  writeJson(join(root, "onboarded.lock.json"), { lockVersion: 1, plugins: [{ plugin: "monolithic-code-review-toolkit" }] });
  const result = check(["--plugin-root", toolkit, "--project", project()], root);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /onboarded\.lock\.json must hold lockVersion 1/);
});


test("adapter-check refuses two plugin roots that provide the same plugin", () => {
  const toolkit = fakeToolkit(TOOLKIT_SKILLS);
  const result = check(["--plugin-root", toolkit, "--plugin-root", fakeToolkit(TOOLKIT_SKILLS), "--project", project()], frameworkPinning(toolkit));
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /More than one --plugin-root provides monolithic-code-review-toolkit/);
});

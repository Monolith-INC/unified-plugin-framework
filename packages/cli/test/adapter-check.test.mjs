import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeCanonicalPlugin } from "@agent-plugins/compiler";
import { mappingDigest, reviewToolkitAdapter } from "@agent-plugins/workflows";

import { runAdapterCheck } from "../dist/adapter-check.js";
import { run } from "../dist/index.js";
import { runUpgradeCheck } from "../dist/upgrade-check.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const framework = join(repoRoot, "plugins/unified-plugin-framework");

const TOOLKIT_SKILLS = ["review-task", "review-story-preflight", "review-story-postflight", "review-feature", "review-setup"];

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
};

const fakeToolkit = (skills, version = "0.6.0") => {
  const root = mkdtempSync(join(tmpdir(), "upf-toolkit-"));
  writeJson(join(root, "plugin.json"), { name: "monolithic-code-review-toolkit", version });
  skills.map((skill) => writeJson(join(root, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: Test skill.\n---\n`));
  return root;
};

const digestOf = (root) => {
  const canonical = normalizeCanonicalPlugin(root);
  assert.equal(canonical.ok, true);
  return canonical.value.sourceDigest;
};

/** A copy of the framework plugin whose lock pins `toolkit` against the current code review mapping. */
const frameworkPinning = (toolkit) => {
  const root = join(mkdtempSync(join(tmpdir(), "upf-framework-")), "unified-plugin-framework");
  cpSync(framework, root, { recursive: true });
  writeJson(join(root, "onboarded.lock.json"), {
    lockVersion: 1,
    plugins: [
      {
        plugin: "monolithic-code-review-toolkit",
        version: JSON.parse(readFileSync(join(toolkit, "plugin.json"), "utf8")).version,
        checksum: digestOf(toolkit),
        adapter: "code-review",
        contractVersion: "1.0.0",
        mappingDigest: mappingDigest(reviewToolkitAdapter),
      },
    ],
  });
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
    digestPlugin: () => undefined,
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

const upgrade = (root, toolkits) =>
  capture(() => run(["upgrade-check", "code-review", "--framework", root, ...toolkits.flatMap((toolkit) => ["--plugin-root", toolkit])]));

const lockAt = (root) => readFileSync(join(root, "onboarded.lock.json"), "utf8");

test("upgrade-check pins a newer release that passes the adapter's checks, and adapter-check then accepts it", () => {
  const root = frameworkPinning(fakeToolkit(TOOLKIT_SKILLS));
  const candidate = fakeToolkit(TOOLKIT_SKILLS, "0.6.3");
  const result = upgrade(root, [candidate]);
  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.changed, true);
  assert.deepEqual(report.pinned, [{ plugin: "monolithic-code-review-toolkit", version: "0.6.3", checksum: digestOf(candidate) }]);
  const [pin] = JSON.parse(lockAt(root)).plugins;
  assert.deepEqual(pin, {
    adapter: "code-review",
    checksum: digestOf(candidate),
    contractVersion: "1.0.0",
    mappingDigest: mappingDigest(reviewToolkitAdapter),
    plugin: "monolithic-code-review-toolkit",
    version: "0.6.3",
  });
  assert.equal(check(["--plugin-root", candidate, "--project", project()], root).exitCode, 0);
  assert.equal(JSON.parse(upgrade(root, [candidate]).stdout).changed, false);
});

test("upgrade-check leaves the lock unchanged and names the failing check for a release that breaks the adapter", () => {
  const root = frameworkPinning(fakeToolkit(TOOLKIT_SKILLS));
  const before = lockAt(root);
  const cases = [
    [fakeToolkit(TOOLKIT_SKILLS.filter((skill) => skill !== "review-feature"), "0.6.3"), "bound", /monolithic-code-review-toolkit:review-feature \(review-feature\)/],
    [fakeToolkit(TOOLKIT_SKILLS.filter((skill) => skill !== "review-setup"), "0.6.3"), "bound", /review-setup \(monolithic-code-review-toolkit knowledge store setup\)/],
    [fakeToolkit(TOOLKIT_SKILLS, "0.7.0"), "installed", /monolithic-code-review-toolkit 0\.7\.0 \(declared \^0\.6\.0\)/],
  ];
  cases.map(([candidate, step, reason]) => {
    const result = upgrade(root, [candidate]);
    assert.equal(result.exitCode, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.step, step);
    assert.match(report.reason, reason);
    assert.equal(report.lock, "unchanged");
    assert.equal(lockAt(root), before);
    return step;
  });
});

test("upgrade-check rejects bad input with exit 2 and prints usage for --help", () => {
  assert.equal(capture(() => run(["upgrade-check", "code-review", "--framework", framework])).exitCode, 2);
  assert.equal(capture(() => run(["upgrade-check", "toString", "--framework", framework, "--plugin-root", "/x"])).exitCode, 2);
  assert.equal(upgrade(framework, [join(repoRoot, "does-not-exist")]).exitCode, 2);
  const help = capture(() => run(["upgrade-check", "--help"]));
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /Usage: agent-plugin upgrade-check/);
});

test("upgrade-check writes the lock only through its injected effect, and only after the checks pass", () => {
  const writes = [];
  const recorded = recordingIo({
    readJson: () => ({ kind: "absent" }),
    inspectPlugin: (root) =>
      root === "/toolkit"
        ? { manifest: { name: "monolithic-code-review-toolkit", version: "0.6.0" }, diagnostics: [], skills: [] }
        : { manifest: { name: "unified-plugin-framework", version: "0.1.0" }, diagnostics: [], onboardedPlugins: [] },
    digestPlugin: () => "e".repeat(64),
    writeText: (path, text) => writes.push([path, text]),
  });
  assert.equal(runUpgradeCheck(recorded.io, ["code-review", "--framework", "/framework", "--plugin-root", "/toolkit"], "/cwd"), 1);
  assert.deepEqual(writes, []);
  assert.deepEqual(recorded.lines.out, []);
});

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { mappingDigest, reviewToolkitAdapter } from "@agent-plugins/workflows";

import { run } from "../dist/index.js";
import { runUpgradeCheck } from "../dist/upgrade-check.js";
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
} from "./onboarded-helpers.mjs";

const check = (args, root) => capture(() => run(["adapter-check", "code-review", "--framework", root, ...args]));

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

test("upgrade-check refuses new content under the version the lock already pins, leaving the lock unchanged", () => {
  const pinnedToolkit = fakeToolkit(TOOLKIT_SKILLS);
  const root = frameworkPinning(pinnedToolkit);
  const before = lockAt(root);
  const tampered = fakeToolkit(TOOLKIT_SKILLS);
  appendFileSync(join(tampered, "skills", "review-task", "SKILL.md"), "Also do something else.\n");
  const result = upgrade(root, [tampered]);
  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.step, "installed");
  assert.match(report.reason, /must not change under its own version/);
  assert.match(report.reason, new RegExp(digestOf(tampered).slice(0, 12)));
  assert.equal(lockAt(root), before);
});

/** An injected world: a framework declaring the toolkit at ^0.6.0, and one candidate toolkit at /toolkit. */
const injected = ({ version = "0.6.3", skills = TOOLKIT_SKILLS, write = () => ({ ok: true }) } = {}) => {
  const writes = [];
  const recorded = recordingIo({
    readJson: () => ({ kind: "absent" }),
    inspectPlugin: () => ({
      manifest: { name: "unified-plugin-framework", version: "0.1.0" },
      diagnostics: [],
      onboardedPlugins: [{ name: "monolithic-code-review-toolkit", version: "^0.6.0", source: "github:x/y", adapter: "code-review" }],
    }),
    readPlugin: () => ({ ok: true, value: { name: "monolithic-code-review-toolkit", version, checksum: "e".repeat(64), skills } }),
    writeText: (path, text) => (writes.push([path, text]), write(path, text)),
  });
  return { ...recorded, writes, run: () => runUpgradeCheck(recorded.io, ["code-review", "--framework", "/framework", "--plugin-root", "/toolkit"], "/cwd") };
};

test("upgrade-check writes the lock once, through its injected effect, only when every check passes", () => {
  const passing = injected();
  assert.equal(passing.run(), 0);
  assert.equal(passing.writes.length, 1);
  assert.equal(passing.writes[0][0], resolve("/framework", "onboarded.lock.json"));
  assert.equal(JSON.parse(passing.writes[0][1]).plugins[0].version, "0.6.3");
  const failing = injected({ skills: ["review-task"] });
  assert.equal(failing.run(), 1);
  assert.deepEqual(failing.writes, []);
  assert.deepEqual(failing.lines.out, []);
});

test("upgrade-check reports a lock it cannot write as a configuration problem, not a crash", () => {
  const unwritable = injected({ write: () => ({ ok: false, message: "EACCES: permission denied" }) });
  assert.equal(unwritable.run(), 2);
  assert.deepEqual(unwritable.lines.out, []);
  assert.match(unwritable.lines.err[0], /Could not write .*onboarded\.lock\.json: EACCES: permission denied\. The lock is unchanged\./);
});

import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { brainstormingDiscoveryAdapter } from "@agent-plugins/workflows";

import { writeJson } from "./onboarded-helpers.mjs";

const discoverySkills = (plugin) => [
  ...new Set(
    [...Object.values(brainstormingDiscoveryAdapter.fulfil).flat(), ...brainstormingDiscoveryAdapter.catalog]
      .filter((ref) => ref.plugin === plugin)
      .map(({ skill }) => skill),
  ),
];

const skillDir = (root, skill, eol = "\n") =>
  writeJson(join(root, skill, "SKILL.md"), `---${eol}name: ${skill}${eol}description: Test skill.${eol}---${eol}`);

/** Superpowers as a Claude Code plugin: `.claude-plugin/plugin.json` beside `skills/`. */
const claudePlugin = (version = "7.0.0") => {
  const root = mkdtempSync(join(tmpdir(), "upf-superpowers-"));
  writeJson(join(root, ".claude-plugin", "plugin.json"), { name: "superpowers", version });
  discoverySkills("superpowers").map((skill) => skillDir(join(root, "skills"), skill));
  return root;
};

/** BMad Method as a bare skills folder, with no manifest. */
const skillsFolder = (eol = "\n") => {
  const root = mkdtempSync(join(tmpdir(), "upf-bmad-"));
  discoverySkills("bmad-method").map((skill) => skillDir(join(root, "skills"), skill, eol));
  return root;
};

/** A copy of the framework plugin; `unpinned` drops its lock, so fakes can be pinned afresh. */
const frameworkCopy = ({ unpinned = false } = {}) => {
  const root = join(mkdtempSync(join(tmpdir(), "upf-framework-")), "unified-plugin-framework");
  cpSync(framework, root, { recursive: true, filter: (source) => !(unpinned && source.endsWith("onboarded.lock.json")) });
  return root;
};

const upgradeDiscovery = (root, roots) =>
  capture(() => run(["upgrade-check", "discovery", "--framework", root, ...roots.flatMap((value) => ["--plugin-root", value])]));

test("upgrade-check reads a Claude Code plugin and a named skills folder, and adapter-check then accepts them", () => {
  const root = frameworkCopy({ unpinned: true });
  const superpowers = claudePlugin();
  const bmad = skillsFolder();
  const result = upgradeDiscovery(root, [superpowers, `bmad-method=${bmad}`]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout).pinned.map(({ plugin, version }) => `${plugin}@${version}`),
    ["superpowers@7.0.0", "bmad-method@6.12.0"],
  );
  const ready = capture(() =>
    run(["adapter-check", "discovery", "--framework", root, "--plugin-root", superpowers, "--plugin-root", `bmad-method=${bmad}`, "--project", project()]),
  );
  assert.equal(ready.exitCode, 0, ready.stderr);
});

test("a skills folder hashes the same with either line ending, and needs a name", () => {
  const root = frameworkCopy({ unpinned: true });
  const superpowers = claudePlugin();
  const lf = JSON.parse(upgradeDiscovery(root, [superpowers, `bmad-method=${skillsFolder()}`]).stdout).pinned[1].checksum;
  const crlf = JSON.parse(upgradeDiscovery(frameworkCopy({ unpinned: true }), [superpowers, `bmad-method=${skillsFolder("\r\n")}`]).stdout).pinned[1].checksum;
  assert.equal(lf, crlf);
  const unnamed = upgradeDiscovery(root, [superpowers, skillsFolder()]);
  assert.equal(unnamed.exitCode, 2);
  assert.match(unnamed.stderr, /has no manifest: name it as --plugin-root <plugin>=/);
});

test("a Claude Code plugin outside its declared range fails the upgrade gate, leaving the lock unchanged", () => {
  const root = frameworkCopy();
  const before = lockAt(root);
  const result = upgradeDiscovery(root, [claudePlugin("8.0.0"), `bmad-method=${skillsFolder()}`]);
  assert.equal(result.exitCode, 1);
  assert.match(JSON.parse(result.stderr).reason, /superpowers 8\.0\.0 \(declared \^7\.0\.0\)/);
  assert.equal(lockAt(root), before);
});

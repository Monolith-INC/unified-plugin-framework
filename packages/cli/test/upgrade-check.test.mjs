import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    readPlugin: () => ({
      ok: true,
      value: {
        manifest: { name: "monolithic-code-review-toolkit", version },
        skills: skills.map((skill) => ({ name: skill, path: `skills/${skill}/SKILL.md`, content: "" })),
        sourceDigest: "e".repeat(64),
      },
    }),
    writeText: (path, text) => (writes.push([path, text]), write(path, text)),
  });
  return { ...recorded, writes, run: () => runUpgradeCheck(recorded.io, ["code-review", "--framework", "/framework", "--plugin-root", "/toolkit"], "/cwd") };
};

test("upgrade-check writes the lock once, through its injected effect, only when every check passes", () => {
  const passing = injected();
  assert.equal(passing.run(), 0);
  assert.equal(passing.writes.length, 1);
  assert.equal(passing.writes[0][0], join("/framework", "onboarded.lock.json"));
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

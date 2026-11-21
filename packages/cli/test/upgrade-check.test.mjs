import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { brainstormingDiscoveryAdapter, mappingDigest, reviewToolkitAdapter } from "@agent-plugins/workflows";

import { run } from "../dist/index.js";
import { runUpgradeCheck } from "../dist/upgrade-check.js";
import {
  capture,
  copyFrameworkAllowlist,
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

const check = (args, root) => capture(() => run(["adapter-check", "code-review", "--framework", root, ...args]));

const upgrade = (root, toolkits) =>
  capture(() => run(["upgrade-check", "code-review", "--framework", root, ...toolkits.flatMap((toolkit) => ["--plugin-root", toolkit])]));

const lockAt = (root) => readFileSync(join(root, "io.github.monolith-inc.upf", "onboarded.lock.json"), "utf8");

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
  assert.equal(passing.writes[0][0], resolve("/framework", "io.github.monolith-inc.upf", "onboarded.lock.json"));
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


const discoverySkills = (plugin) => [
  ...new Set(
    [...Object.values(brainstormingDiscoveryAdapter.fulfil).flat(), ...brainstormingDiscoveryAdapter.catalog, ...(brainstormingDiscoveryAdapter.supportSkills ?? [])]
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
const frameworkCopy = ({ unpinned = false } = {}) =>
  copyFrameworkAllowlist(join(mkdtempSync(join(tmpdir(), "upf-framework-")), "unified-plugin-framework"), { unpinned });

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
  assert.match(unnamed.stderr, /has no manifest: name it as --plugin-root <plugin>@<version>=/);
});

test("a Claude Code plugin outside its declared range fails the upgrade gate, leaving the lock unchanged", () => {
  const root = frameworkCopy({ unpinned: true });
  const bmad = skillsFolder();
  assert.equal(upgradeDiscovery(root, [claudePlugin(), `bmad-method=${bmad}`]).exitCode, 0);
  const before = lockAt(root);
  const result = upgradeDiscovery(root, [claudePlugin("8.0.0"), `bmad-method=${bmad}`]);
  assert.equal(result.exitCode, 1);
  assert.match(JSON.parse(result.stderr).reason, /superpowers 8\.0\.0 \(declared \^7\.0\.0\)/);
  assert.equal(lockAt(root), before);
});

test("a newer release of a manifest-less plugin is adopted when its version is given, and refused when it is not", () => {
  const root = frameworkCopy({ unpinned: true });
  const superpowers = claudePlugin();
  assert.equal(upgradeDiscovery(root, [superpowers, `bmad-method=${skillsFolder()}`]).exitCode, 0);
  const next = skillsFolder();
  appendFileSync(join(next, "skills", "bmad-spec", "SKILL.md"), "A change in the next release.\n");
  const unversioned = upgradeDiscovery(root, [superpowers, `bmad-method=${next}`]);
  assert.equal(unversioned.exitCode, 1);
  assert.match(JSON.parse(unversioned.stderr).recovery.message, /--plugin-root <plugin>@<version>=<dir>/);
  const versioned = upgradeDiscovery(root, [superpowers, `bmad-method@6.13.0=${next}`]);
  assert.equal(versioned.exitCode, 0, versioned.stderr);
  const [, bmadPin] = JSON.parse(versioned.stdout).pinned;
  assert.deepEqual([bmadPin.plugin, bmadPin.version], ["bmad-method", "6.13.0"]);
  assert.equal(JSON.parse(lockAt(root)).plugins.find(({ plugin }) => plugin === "bmad-method").version, "6.13.0");
});

test("a version given on the command line must agree with the plugin's own manifest", () => {
  const result = upgradeDiscovery(frameworkCopy({ unpinned: true }), [`superpowers@7.1.0=${claudePlugin()}`, `bmad-method=${skillsFolder()}`]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /is version 7\.0\.0 by its manifest, not 7\.1\.0 as given/);
});

test("adapter-check takes an adopted manifest-less release's version from its pin, so it needs no version given", () => {
  const root = frameworkCopy({ unpinned: true });
  const superpowers = claudePlugin();
  const next = skillsFolder();
  appendFileSync(join(next, "skills", "bmad-spec", "SKILL.md"), "A change in the next release.\n");
  assert.equal(upgradeDiscovery(root, [superpowers, `bmad-method@6.13.0=${next}`]).exitCode, 0);
  const ready = capture(() =>
    run(["adapter-check", "discovery", "--framework", root, "--plugin-root", superpowers, "--plugin-root", `bmad-method=${next}`, "--project", project()]),
  );
  assert.equal(ready.exitCode, 0, ready.stderr);
});

test("the checksum of a skills folder covers every file in each skill, not only SKILL.md", () => {
  const superpowers = claudePlugin();
  const before = skillsFolder();
  const after = skillsFolder();
  writeFileSync(join(after, "skills", "bmad-review", "lens.md"), "A supporting file.\n");
  const checksumOf = (bmad) => JSON.parse(upgradeDiscovery(frameworkCopy({ unpinned: true }), [superpowers, `bmad-method=${bmad}`]).stdout).pinned[1].checksum;
  assert.notEqual(checksumOf(before), checksumOf(after));
});

test("a plugin root that is not a folder, a malformed named root, or a name that contradicts the manifest is a configuration problem", () => {
  const root = frameworkCopy({ unpinned: true });
  const notAFolder = join(mkdtempSync(join(tmpdir(), "upf-file-")), "plain.txt");
  writeFileSync(notAFolder, "not a plugin\n");
  const cases = [
    [[claudePlugin(), `bmad-method=${notAFolder}`], /plugin\.root\.(unreadable|unrecognised)/],
    [[claudePlugin(), `bmad-method@6.13=${skillsFolder()}`], /"6\.13" is not a release version/],
    [[`bmad-method=${claudePlugin()}`, `bmad-method=${skillsFolder()}`], /is superpowers by its manifest, not bmad-method as given/],
  ];
  cases.map(([roots, message]) => {
    const result = upgradeDiscovery(root, roots);
    assert.equal(result.exitCode, 2, result.stderr);
    assert.match(result.stderr, message);
    return message;
  });
});

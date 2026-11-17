import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runInstallCommand } from "../dist/index.js";

const repo = resolve(import.meta.dirname, "../../..");
const framework = join(repo, "plugins", "unified-plugin-framework");
const VENDORS = ["claude", "codex", "cursor"];

const capture = (operation) => {
  const stdout = [];
  const stderr = [];
  const priorLog = console.log;
  const priorError = console.error;
  console.log = (value) => stdout.push(String(value));
  console.error = (value) => stderr.push(String(value));
  try {
    return { code: operation(), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = priorLog;
    console.error = priorError;
  }
};

const install = (plugin, vendor) => {
  const target = mkdtempSync(join(tmpdir(), `cli-shipped-${vendor}-`));
  return { target, ...capture(() => runInstallCommand([plugin, "--vendor", vendor, "--target", target])) };
};

const diagnosticCodes = (stderr) => JSON.parse(stderr).diagnostics.map(({ code }) => code);

test("the framework plugin installs each host's assembled skills, naming the onboarded plugins and no placeholder", () => {
  VENDORS.map((vendor) => {
    const { target, code, stderr } = install(framework, vendor);
    assert.equal(code, 0, stderr);
    assert.deepEqual(readdirSync(join(target, "skills")).toSorted(), [
      "continuity-checkpoint",
      "continuity-continue",
      "continuity-recover",
      "discover-comprehensive",
      "discover-quick",
      "discover-research",
      "discover-thorough",
      "implement-verify",
      "implement-work",
      "project-bootstrap",
      "project-operations",
      "review-feature",
      "review-story",
      "review-task",
      "track-amend",
      "track-breakdown",
      "track-decompose",
      "track-enrich",
      "track-from-design",
      "track-split",
      "track-validate",
    ]);
    readdirSync(join(target, "skills")).map((skill) => {
      const text = readFileSync(join(target, "skills", skill, "SKILL.md"), "utf8");
      assert.match(text, skill.startsWith("discover-") ? /`superpowers:brainstorming` throughout/
        : skill.startsWith("project-") ? /agent-plugin project/
          : skill.startsWith("track-") || skill.startsWith("implement-") ? /reviewed content excerpts/
            : skill.startsWith("continuity-") ? /agent-continuity:session-/ : /monolithic-code-review-toolkit:/);
      assert.doesNotMatch(text, /\{\{/);
      return skill;
    });
    return vendor;
  });
});

test("a source install builds from the checkout as it is, so an edited template is installed as edited", () => {
  const source = join(mkdtempSync(join(tmpdir(), "cli-edit-")), "unified-plugin-framework");
  cpSync(framework, source, { recursive: true });
  appendFileSync(join(source, "skills", "review-task", "SKILL.md"), "\nAn edit made after the last release.\n");
  VENDORS.map((vendor) => {
    const { target, code, stderr } = install(source, vendor);
    assert.equal(code, 0, stderr);
    assert.match(readFileSync(join(target, "skills", "review-task", "SKILL.md"), "utf8"), /An edit made after the last release\./);
    return vendor;
  });
});

test("a directory that is not a plugin writes nothing and reports the plugin as invalid", () => {
  const empty = mkdtempSync(join(tmpdir(), "cli-not-a-plugin-"));
  writeFileSync(join(empty, "README.md"), "Not a plugin.\n");
  const { target, code, stderr } = install(empty, "claude");
  assert.equal(code, 3);
  assert.ok(diagnosticCodes(stderr).length > 0);
  assert.deepEqual(readdirSync(target), []);
});


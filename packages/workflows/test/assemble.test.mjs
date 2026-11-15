import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assemblePluginSource, assembleSkills, reviewToolkitAdapter } from "../dist/index.js";

const template = (name) => `---\nname: ${name}\ndescription: Test.\n---\n{{generated}}\n\n{{readiness}}\n\n{{delegate}}\n`;

const pluginSource = new URL("../../../plugins/unified-plugin-framework/", import.meta.url);

test("templates named after a contract operation are rendered from its adapter", () => {
  const result = assembleSkills(new Map([["review-task", template("review-task")]]));
  assert.equal(result.ok, true, result.problems?.join("; "));
  const text = result.skills.get("review-task");
  assert.match(text, /monolithic-code-review-toolkit:review-task/);
  assert.doesNotMatch(text, /\{\{/);
});

test("skills without placeholders pass through unchanged", () => {
  const plain = "---\nname: notes\ndescription: Plain skill.\n---\nNothing to fill.\n";
  const result = assembleSkills(new Map([["notes", plain]]));
  assert.equal(result.ok, true);
  assert.equal(result.skills.get("notes"), plain);
});

test("a template whose name is no contract operation fails", () => {
  const result = assembleSkills(new Map([["review-everything", template("review-everything")]]));
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /review-everything/);
});

test("an unknown placeholder fails, naming the skill", () => {
  const result = assembleSkills(new Map([["review-task", "{{surprise}}"]]));
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /review-task.*surprise/);
});

test("an operation claimed by two workflows fails", () => {
  const twin = { ...reviewToolkitAdapter, workflow: "code-review" };
  const result = assembleSkills(new Map([["review-task", template("review-task")]]), [reviewToolkitAdapter, twin]);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /review-task.*more than one workflow/);
});

test("assemblePluginSource copies the plugin and renders its templates into staging, leaving the source untouched", () => {
  const staging = join(mkdtempSync(join(tmpdir(), "upf-assemble-")), "plugin");
  const result = assemblePluginSource(pluginSource.pathname, staging);
  assert.equal(result.ok, true, result.problems?.join("; "));
  assert.equal(existsSync(join(staging, "plugin.json")), true);
  readdirSync(join(staging, "skills")).map((skill) => {
    const text = readFileSync(join(staging, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /\{\{/);
    assert.match(text, /monolithic-code-review-toolkit:/);
    return skill;
  });
  assert.match(readFileSync(new URL("skills/review-task/SKILL.md", pluginSource), "utf8"), /\{\{delegate\}\}/);
});

test("assemblePluginSource refuses a staging directory that already exists", () => {
  const staging = mkdtempSync(join(tmpdir(), "upf-assemble-existing-"));
  mkdirSync(join(staging, "keep"));
  writeFileSync(join(staging, "keep", "file.txt"), "keep");
  const result = assemblePluginSource(pluginSource.pathname, staging);
  assert.equal(result.ok, false);
  assert.equal(readFileSync(join(staging, "keep", "file.txt"), "utf8"), "keep");
});

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assemblePluginSource, assembleSkills, reviewToolkitAdapter } from "../dist/index.js";

const template = (name) => `---\nname: ${name}\ndescription: Test.\n---\n{{generated}}\n\n{{readiness}}\n\n{{delegate}}\n`;

const pluginSource = new URL("../../../", import.meta.url);

const lock = JSON.parse(readFileSync(new URL("io.github.monolith-inc.upf/onboarded.lock.json", pluginSource), "utf8"));
const EMPTY = { lockVersion: 1, plugins: [] };

test("templates named after a contract operation are rendered from its adapter", () => {
  const result = assembleSkills(new Map([["review-task", template("review-task")]]), lock);
  assert.equal(result.ok, true, result.problems?.join("; "));
  const text = result.skills.get("review-task");
  assert.match(text, /`monolithic-code-review-toolkit-review-task`/);
  assert.doesNotMatch(text, /\{\{/);
});

test("skills without placeholders pass through unchanged", () => {
  const plain = "---\nname: notes\ndescription: Plain skill.\n---\nNothing to fill.\n";
  const result = assembleSkills(new Map([["notes", plain]]), lock);
  assert.equal(result.ok, true);
  assert.equal(result.skills.get("notes"), plain);
});

test("a template whose name is no contract operation fails", () => {
  const result = assembleSkills(new Map([["review-everything", template("review-everything")]]), lock);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /review-everything/);
});

test("assemblePluginSource copies only the v1.0.0 plugin allowlist and never leaks repo or dev folders", () => {
  const staging = join(mkdtempSync(join(tmpdir(), "upf-allowlist-")), "staged");
  const result = assemblePluginSource(fileURLToPath(pluginSource), staging);
  assert.equal(result.ok, true, result.problems?.join("; "));
  const entries = readdirSync(staging).sort();
  assert.equal(entries.includes("plugin.json"), true);
  assert.equal(entries.includes("skills"), true);
  assert.equal(entries.includes("io.github.monolith-inc.upf"), true);
  for (const forbidden of ["packages", "fixtures", "docs", "node_modules", ".git", ".claude", ".codex", ".agents", "scripts"]) {
    assert.equal(existsSync(join(staging, forbidden)), false, `non-plugin path ${forbidden} must not leak into staged payload`);
  }
});

test("an unknown placeholder fails, naming the skill", () => {
  const result = assembleSkills(new Map([["review-task", "{{surprise}}"]]), lock);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /review-task.*surprise/);
});

test("an operation claimed by two workflows fails", () => {
  const twin = { ...reviewToolkitAdapter, workflow: "code-review" };
  const result = assembleSkills(new Map([["review-task", template("review-task")]]), lock, [reviewToolkitAdapter, twin]);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /review-task.*more than one workflow/);
});

test("assemblePluginSource copies the plugin and renders its templates into staging, leaving the source untouched", () => {
  const staging = join(mkdtempSync(join(tmpdir(), "upf-assemble-")), "plugin");
  const result = assemblePluginSource(fileURLToPath(pluginSource), staging);
  assert.equal(result.ok, true, result.problems?.join("; "));
  assert.equal(existsSync(join(staging, "plugin.json")), true);
  readdirSync(join(staging, "skills")).map((skill) => {
    const text = readFileSync(join(staging, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /\{\{/);
    skill.startsWith("project-") || skill === "repair-workflow" || skill === "bmad-design-handoff"
      ? assert.equal(text, readFileSync(new URL(`skills/${skill}/SKILL.md`, pluginSource), "utf8"))
      : assert.match(text, skill.startsWith("discover-") ? /`brainstorming` throughout/
        : skill.startsWith("knowledge-") ? /`(?:setup-project-knowledge|discover-project-knowledge|query-project-knowledge|refresh-project-knowledge|ingest-docs|publish-docs)`/
          : skill.startsWith("track-") || skill.startsWith("implement-") ? /reviewed content excerpts/
            : skill.startsWith("continuity-") ? /`session-/ : /`(?:monolithic-code-review-toolkit-review-|review-story-)/);
    return skill;
  });
  assert.match(readFileSync(new URL("skills/review-task/SKILL.md", pluginSource), "utf8"), /\{\{delegate\}\}/);
});

test("assemblePluginSource refuses a staging directory that already exists", () => {
  const staging = mkdtempSync(join(tmpdir(), "upf-assemble-existing-"));
  mkdirSync(join(staging, "keep"));
  writeFileSync(join(staging, "keep", "file.txt"), "keep");
  const result = assemblePluginSource(fileURLToPath(pluginSource), staging);
  assert.equal(result.ok, false);
  assert.equal(readFileSync(join(staging, "keep", "file.txt"), "utf8"), "keep");
});

test("a template whose plugin has no pin fails assembly; a plugin without templates needs no lock", () => {
  const unpinned = assembleSkills(new Map([["review-task", template("review-task")]]), EMPTY);
  assert.equal(unpinned.ok, false);
  assert.match(unpinned.problems.join("\n"), /no pin in io\.github\.monolith-inc\.upf\/onboarded\.lock\.json/);
  assert.equal(assembleSkills(new Map([["notes", "---\nname: notes\ndescription: Plain.\n---\n"]]), EMPTY).ok, true);
});

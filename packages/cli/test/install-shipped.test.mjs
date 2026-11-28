import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runInstallCommand } from "../dist/index.js";
import { codexAdapter } from "@agent-plugins/adapter-codex";
import { assemblePluginSource, buildVendorBundle } from "@agent-plugins/workflows";

const repo = resolve(import.meta.dirname, "../../..");
const framework = repo;
const VENDORS = ["claude", "codex", "cursor"];

async function capture(operation) {
  const stdout = [];
  const stderr = [];
  const priorLog = console.log;
  const priorError = console.error;
  console.log = (value) => stdout.push(String(value));
  console.error = (value) => stderr.push(String(value));
  try {
    const code = await operation();
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally { console.log = priorLog; console.error = priorError; }
}

const install = async (plugin, vendor) => {
  const target = mkdtempSync(join(tmpdir(), `cli-shipped-${vendor}-`));
  return { target, ...(await capture(() => runInstallCommand(["--source", plugin, "--vendor", vendor, "--target", target]))) };
};

const diagnosticCodes = (stderr) => JSON.parse(stderr).diagnostics.map(({ code }) => code);

test("the framework plugin installs each host's assembled skills, naming the onboarded plugins and no placeholder", async () => {
  for (const vendor of VENDORS) {
    const { target, code, stderr } = await install(framework, vendor);
    assert.equal(code, 0, stderr);
    assert.deepEqual(readdirSync(join(target, "skills")).toSorted(), [
      "bmad-design-handoff",
      "continuity-checkpoint",
      "continuity-continue",
      "continuity-recover",
      "discover-comprehensive",
      "discover-quick",
      "discover-research",
      "discover-thorough",
      "implement-verify",
      "implement-work",
      "knowledge-discover",
      "knowledge-ingest",
      "knowledge-publish",
      "knowledge-query",
      "knowledge-refresh",
      "knowledge-setup",
      "project-bootstrap",
      "project-operations",
      "repair-workflow",
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
      assert.match(text, skill === "bmad-design-handoff" ? /agent-plugin design-handoff inspect/
        : skill.startsWith("discover-") ? /`brainstorming` throughout/
        : skill.startsWith("knowledge-") ? /`(?:setup-project-knowledge|discover-project-knowledge|query-project-knowledge|refresh-project-knowledge|ingest-docs|publish-docs)`/
          : skill.startsWith("project-") ? /agent-plugin project/
            : skill === "repair-workflow" ? /agent-plugin adapter-check/
              : skill.startsWith("track-") || skill.startsWith("implement-") ? /reviewed content excerpts/
                : skill.startsWith("continuity-") ? /`session-/ : /`(?:monolithic-code-review-toolkit-review-|review-story-)/);
      assert.doesNotMatch(text, /\{\{/);
      if (skill.startsWith("discover-")) {
        assert.match(text, /## Reusable presentation blueprints/);
        assert.match(text, /Artifact blueprint/);
        assert.match(text, /Choice blueprint/);
        assert.match(text, /Review blueprint/);
        assert.match(text, /shown revision/);
        assert.match(text, /Migration plan/);
        assert.match(text, /Add export/);
        assert.match(text, /Which format\?/);
        assert.match(text, /literal custom answer/);
        assert.match(text, /show r2 before accepting an approval for r2/);
        assert.match(text, /host exposes `upf_discovery_question`.*saved discovery state/);
        assert.match(text, /Use the returned state as the continuation/);
        assert.match(text, /When the tool is unavailable, use `node \.upf-tools\/bin\/agent-plugin question next <json>`/);
        assert.doesNotMatch(text, /ask one focused decision per tool call when a host supports single-choice pickers only/);
      }
      if (skill === "discover-thorough") assert.match(text, /shared decision contract to select a channel that supports the complete multi-select question and custom answers/);
      return skill;
    });
  }
});

test("blueprint guidance survives assembly and a release bundle", () => {
  const stage = join(mkdtempSync(join(tmpdir(), "upf-blueprints-")), "assembled");
  const assembly = assemblePluginSource(framework, stage);
  assert.equal(assembly.ok, true);
  const assembled = readFileSync(join(stage, "skills", "discover-quick", "SKILL.md"), "utf8");
  assert.match(assembled, /## Reusable presentation blueprints/);
  assert.doesNotMatch(assembled, /\{\{/);
  const bundle = buildVendorBundle(framework, codexAdapter);
  assert.equal(bundle.ok, true);
  const skill = bundle.value.files.find((file) => file.path.endsWith("skills/discover-quick/SKILL.md"));
  assert.ok(skill);
  assert.match(new TextDecoder().decode(skill.content), /## Reusable presentation blueprints/);
});

test("a source install builds from the checkout as it is, so an edited template is installed as edited", async () => {
  const source = join(mkdtempSync(join(tmpdir(), "cli-edit-")), "unified-plugin-framework");
  cpSync(framework, source, { recursive: true });
  appendFileSync(join(source, "skills", "review-task", "SKILL.md"), "\nAn edit made after the last release.\n");
  for (const vendor of VENDORS) {
    const { target, code, stderr } = await install(source, vendor);
    assert.equal(code, 0, stderr);
    assert.match(readFileSync(join(target, "skills", "review-task", "SKILL.md"), "utf8"), /An edit made after the last release\./);
  }
});

test("a directory that is not a plugin, or no directory at all, writes nothing and reports why", async () => {
  const empty = mkdtempSync(join(tmpdir(), "cli-not-a-plugin-"));
  writeFileSync(join(empty, "README.md"), "Not a plugin.\n");
  const { target, code, stderr } = await install(empty, "claude");
  assert.equal(code, 3);
  assert.ok(diagnosticCodes(stderr).length > 0);
  assert.deepEqual(readdirSync(target), []);
  const missing = await install(join(empty, "no-such-plugin"), "claude");
  assert.equal(missing.code, 3);
  assert.deepEqual(diagnosticCodes(missing.stderr), ["release.source.unreadable"]);
  assert.deepEqual(readdirSync(missing.target), []);
});


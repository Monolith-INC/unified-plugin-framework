import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTINUITY_OPERATIONS, agentContinuityAdapter, checkPluginBinding, mappingDigest, renderSkill } from "../dist/index.js";

const plugin = "agent-continuity";
const checksum = "c".repeat(64);
const lock = { lockVersion: 1, plugins: [{ plugin, version: "0.13.0", checksum, adapter: "continuity", contractVersion: "1.0.0", mappingDigest: mappingDigest(agentContinuityAdapter) }] };
const installed = { version: "0.13.0", checksum, skills: ["session-continue", "session-checkpoint", "session-recover"] };
const facts = { adapter: agentContinuityAdapter, lock, onboarded: [{ name: plugin, version: "0.13.0", source: "github:Monolith-INC/agent-continuity", adapter: "continuity" }], installed: new Map([[plugin, installed]]) };

test("continuity maps every outcome to its real public lifecycle operation", () => {
  assert.deepEqual(CONTINUITY_OPERATIONS.map((op) => agentContinuityAdapter.fulfil[op][0].skill), installed.skills);
  assert.deepEqual(checkPluginBinding(facts), { status: "ready" });
  assert.deepEqual(agentContinuityAdapter.knowledgeStores, []);
});

test("continuity dependency and source drift report the existing recovery", () => {
  const missing = checkPluginBinding({ ...facts, installed: new Map() });
  assert.equal(missing.status, "not-ready");
  assert.match(missing.reason, /agent-continuity/);
  assert.ok(missing.recovery);
  const drift = checkPluginBinding({ ...facts, installed: new Map([[plugin, { ...installed, checksum: "d".repeat(64) }]]) });
  assert.equal(drift.status, "not-ready");
  assert.ok(drift.recovery);
  const absentOperation = checkPluginBinding({ ...facts, installed: new Map([[plugin, { ...installed, skills: ["session-continue"] }]]) });
  assert.equal(absentOperation.status, "not-ready");
  assert.match(absentOperation.reason, /session-checkpoint|session-recover/);
});

test("continuity templates stay provider-free, reuse setup and bind the pinned operation", () => {
  const templates = CONTINUITY_OPERATIONS.map((op) => [op, readFileSync(new URL(`../../../skills/${op}/SKILL.md`, import.meta.url), "utf8")]);
  templates.forEach(([op, template]) => {
    assert.doesNotMatch(template, /agent-continuity|Linear|Azure DevOps|Obsidian/);
    const rendered = renderSkill(template, agentContinuityAdapter, op, lock);
    assert.equal(rendered.ok, true);
    assert.match(rendered.text, new RegExp(`agent-continuity:${agentContinuityAdapter.fulfil[op][0].skill}`));
    assert.doesNotMatch(rendered.text, /\{\{\w+\}\}/);
    assert.match(template, /[Rr]euse|established/);
  });
});

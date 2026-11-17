import assert from "node:assert/strict";
import test from "node:test";

import { adapterPlugins, checkAdapterReadiness, firstFailure } from "../dist/index.js";

const ref = (plugin, skill) => ({ plugin, skill });

const reviewKitStore = { plugin: "review-kit", file: ".review-kit/config.json", key: ["knowledge", "root"], setup: "setup" };

const adapter = Object.freeze({
  workflow: "code-review",
  contractVersion: "1.0.0",
  fulfil: Object.freeze({
    "review-task": [ref("review-kit", "task")],
    "review-story": [ref("review-kit", "story-pre"), ref("review-kit", "story-post")],
  }),
  knowledgeStores: [reviewKitStore],
});

const declared = (name) => ({ name, version: "^1.0.0", source: `github:example/${name}`, adapter: "code-review" });

const facts = {
  adapter,
  onboarded: [declared("review-kit")],
  pluginSkills: new Map([["review-kit", ["task", "story-pre", "story-post", "setup"]]]),
  projectStore: "/repo/knowledge",
  pluginStores: new Map([["review-kit", "/repo/knowledge"]]),
};

test("adapterPlugins lists each referenced plugin once", () => {
  assert.deepEqual(adapterPlugins(adapter), ["review-kit"]);
});

test("the workflow is ready when every step passes", () => {
  assert.deepEqual(checkAdapterReadiness(facts), { status: "ready" });
});

test("a plugin not declared for the workflow fails at the declared step", () => {
  const result = checkAdapterReadiness({ ...facts, onboarded: [{ ...declared("review-kit"), adapter: "discovery" }] });
  assert.equal(result.status, "not-ready");
  assert.equal(result.step, "declared");
  assert.match(result.reason, /review-kit/);
});

test("a plugin with no installed skills fails at the installed step", () => {
  assert.equal(checkAdapterReadiness({ ...facts, pluginSkills: new Map() }).step, "installed");
});

test("a missing mapped skill fails at the bound step, naming the skill and its operation", () => {
  const result = checkAdapterReadiness({ ...facts, pluginSkills: new Map([["review-kit", ["task", "story-pre"]]]) });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /review-kit:story-post \(review-story\)/);
});

test("an unconfigured project knowledge store fails at the bound step", () => {
  const result = checkAdapterReadiness({ ...facts, projectStore: undefined });
  assert.equal(result.step, "bound");
  assert.equal(result.recovery.skill.skill, "setup-project-knowledge");
});

test("a plugin whose own store is unset fails at the bound step, naming its file and key", () => {
  const result = checkAdapterReadiness({ ...facts, pluginStores: new Map([["review-kit", undefined]]) });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /review-kit/);
  assert.match(result.reason, /\.review-kit\/config\.json \(knowledge\.root\)/);
});

test("a plugin whose store differs from the project's fails at the bound step", () => {
  const result = checkAdapterReadiness({ ...facts, pluginStores: new Map([["review-kit", "/repo/other"]]) });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /\/repo\/other/);
  assert.match(result.reason, /\/repo\/knowledge/);
});

test("an adapter whose plugins keep no store of their own needs only the project store", () => {
  const result = checkAdapterReadiness({ ...facts, adapter: { ...adapter, knowledgeStores: [] }, pluginStores: new Map() });
  assert.deepEqual(result, { status: "ready" });
});

test("each failure carries a recovery action", () => {
  const recoveryFor = (overrides) => checkAdapterReadiness({ ...facts, ...overrides }).recovery;
  assert.deepEqual(recoveryFor({ projectStore: undefined }), {
    action: "run-skill",
    skill: { plugin: "project-knowledge", skill: "setup-project-knowledge" },
    goal: "Create the project knowledge store with the recommended defaults.",
  });
  assert.deepEqual(recoveryFor({ pluginStores: new Map([["review-kit", undefined]]) }), {
    action: "run-skill",
    skill: { plugin: "review-kit", skill: "setup" },
    goal: "Set knowledge.root in .review-kit/config.json to /repo/knowledge.",
  });
  assert.equal(recoveryFor({ pluginSkills: new Map() }).action, "ask-user");
  assert.match(recoveryFor({ pluginSkills: new Map() }).message, /review-kit.*\^1\.0\.0.*github:example\/review-kit/);
  assert.equal(recoveryFor({ onboarded: [] }).action, "ask-user");
  assert.equal(recoveryFor({ pluginSkills: new Map([["review-kit", ["task"]]]) }).action, "ask-user");
});

test("the first failing step wins", () => {
  assert.equal(checkAdapterReadiness({ ...facts, onboarded: [], pluginSkills: new Map() }).step, "declared");
});

test("firstFailure is a lawful monoid over readiness results", () => {
  const samples = [
    { status: "ready" },
    { status: "not-ready", step: "declared", reason: "a" },
    { status: "not-ready", step: "installed", reason: "b" },
    { status: "not-ready", step: "bound", reason: "c" },
  ];
  samples.map((x) =>
    samples.map((y) =>
      samples.map((z) =>
        assert.deepEqual(
          firstFailure.concat(firstFailure.concat(x, y), z),
          firstFailure.concat(x, firstFailure.concat(y, z)),
        ),
      ),
    ),
  );
  samples.map((x) => {
    assert.deepEqual(firstFailure.concat(firstFailure.empty, x), x);
    assert.deepEqual(firstFailure.concat(x, firstFailure.empty), x);
    return x;
  });
});

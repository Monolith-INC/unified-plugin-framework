import assert from "node:assert/strict";
import test from "node:test";

import { adapterPlugins, checkAdapterReadiness } from "../dist/index.js";

const ref = (plugin, skill) => ({ plugin, skill });

const adapter = Object.freeze({
  workflow: "code-review",
  contractVersion: "1.0.0",
  fulfil: Object.freeze({
    "review-task": [ref("review-kit", "task")],
    "review-story": [ref("review-kit", "story-pre"), ref("review-kit", "story-post")],
  }),
});

const declared = (name) => ({ name, version: "^1.0.0", source: `github:example/${name}`, adapter: "code-review" });

const facts = {
  adapter,
  onboarded: [declared("review-kit")],
  pluginSkills: new Map([["review-kit", ["task", "story-pre", "story-post", "setup"]]]),
  knowledgeRoots: { project: "/repo/knowledge", review: "/repo/knowledge" },
};

test("adapterPlugins lists each referenced plugin once", () => {
  assert.deepEqual(adapterPlugins(adapter), ["review-kit"]);
});

test("the workflow is ready when every step passes", () => {
  assert.deepEqual(checkAdapterReadiness(facts), { status: "ready" });
});

test("a review store left unset still counts as the shared store", () => {
  assert.deepEqual(checkAdapterReadiness({ ...facts, knowledgeRoots: { project: "/repo/knowledge" } }), {
    status: "ready",
  });
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
  const result = checkAdapterReadiness({
    ...facts,
    pluginSkills: new Map([["review-kit", ["task", "story-pre"]]]),
  });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /review-kit:story-post \(review-story\)/);
});

test("an unconfigured knowledge store fails at the bound step", () => {
  const result = checkAdapterReadiness({ ...facts, knowledgeRoots: {} });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /setup-project-knowledge/);
});

test("knowledge stores that differ fail at the bound step", () => {
  const result = checkAdapterReadiness({ ...facts, knowledgeRoots: { project: "/repo/a", review: "/repo/b" } });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /\/repo\/a.*\/repo\/b/);
});

test("the first failing step wins", () => {
  assert.equal(checkAdapterReadiness({ ...facts, onboarded: [], pluginSkills: new Map() }).step, "declared");
});

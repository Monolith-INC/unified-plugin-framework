import assert from "node:assert/strict";
import test from "node:test";

import { adapterPlugins, checkAdapterReadiness, checkPluginBinding, firstFailure, mappingDigest } from "../dist/index.js";

const ref = (plugin, skill) => ({ plugin, skill });

const reviewKitStore = { plugin: "review-kit", file: ".review-kit/config.json", key: ["knowledge", "root"], setup: "setup" };

const adapter = Object.freeze({
  workflow: "code-review",
  contractVersion: "1.0.0",
  composition: "one-of",
  catalog: [],
  bareSkillPlugins: [],
  fulfil: Object.freeze({
    "review-task": [ref("review-kit", "task")],
    "review-story": [ref("review-kit", "story-pre"), ref("review-kit", "story-post")],
  }),
  knowledgeStores: [reviewKitStore],
});

const declared = (name) => ({ name, version: "^1.0.0", source: `github:example/${name}`, adapter: "code-review" });

const CHECKSUM = "a".repeat(64);

/** review-kit as installed: these skills, at this version and checksum. */
const kit = (skills, { version = "1.2.0", checksum = CHECKSUM } = {}) => new Map([["review-kit", { version, checksum, skills }]]);

const ALL_SKILLS = ["task", "story-pre", "story-post", "setup"];

const pinned = (overrides = {}) => ({
  lockVersion: 1,
  plugins: [
    {
      plugin: "review-kit",
      version: "1.2.0",
      checksum: CHECKSUM,
      adapter: "code-review",
      contractVersion: "1.0.0",
      mappingDigest: mappingDigest(adapter),
      ...overrides,
    },
  ],
});

const facts = {
  adapter,
  onboarded: [declared("review-kit")],
  installed: kit(ALL_SKILLS),
  lock: pinned(),
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
  assert.equal(checkAdapterReadiness({ ...facts, installed: new Map() }).step, "installed");
});

test("a missing mapped skill fails at the bound step, naming the skill and its operation", () => {
  const result = checkAdapterReadiness({ ...facts, installed: kit(["task", "story-pre", "setup"]) });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /review-kit:story-post \(review-story\)/);
});

test("a missing knowledge-store setup skill fails at the bound step, because recovery relies on it", () => {
  const result = checkAdapterReadiness({ ...facts, installed: kit(["task", "story-pre", "story-post"]) });
  assert.equal(result.step, "bound");
  assert.match(result.reason, /review-kit:setup \(review-kit knowledge store setup\)/);
});

test("an installed version outside the declared range fails at the installed step, widening before re-checking", () => {
  const result = checkAdapterReadiness({ ...facts, installed: kit(ALL_SKILLS, { version: "2.0.0" }) });
  assert.equal(result.step, "installed");
  assert.match(result.reason, /review-kit 2\.0\.0 \(declared \^1\.0\.0\)/);
  assert.match(result.recovery.message, /widen the range .* first, then run `agent-plugin upgrade-check code-review --framework .* --plugin-root .*`/);
});

test("a declared range the framework cannot read fails at the declared step, not as a version outside it", () => {
  const result = checkAdapterReadiness({ ...facts, onboarded: [{ ...declared("review-kit"), version: ">=1.0.0" }] });
  assert.equal(result.step, "declared");
  assert.match(result.reason, /unsupported version ranges: review-kit ">=1\.0\.0"/);
  assert.match(result.recovery.message, /x\.y\.z, \^x\.y\.z or ~x\.y\.z/);
});

test("an installed plugin whose checksum differs from the lock fails at the installed step, naming both", () => {
  const result = checkAdapterReadiness({ ...facts, installed: kit(ALL_SKILLS, { checksum: "b".repeat(64) }) });
  assert.equal(result.step, "installed");
  assert.match(result.reason, /review-kit 1\.2\.0 \(bbbbbbbbbbbb\) is installed, but onboarded\.lock\.json pins 1\.2\.0 \(aaaaaaaaaaaa\)/);
  assert.match(result.recovery.message, /Reinstall the pinned release/);
});

test("a different installed version is told how to adopt it with the full upgrade-check command", () => {
  const result = checkAdapterReadiness({ ...facts, installed: kit(ALL_SKILLS, { version: "1.3.0", checksum: "b".repeat(64) }) });
  assert.equal(result.step, "installed");
  assert.match(result.recovery.message, /Install the pinned version, or check the installed one with `agent-plugin upgrade-check code-review --framework/);
});

test("an unpinned plugin, or one pinned against another mapping, fails at the installed step", () => {
  assert.match(checkAdapterReadiness({ ...facts, lock: { lockVersion: 1, plugins: [] } }).reason, /review-kit is not pinned/);
  assert.match(
    checkAdapterReadiness({ ...facts, lock: pinned({ mappingDigest: "c".repeat(64) }) }).reason,
    /the code-review contract or mapping changed since review-kit 1\.2\.0 was pinned/,
  );
});

test("the plugin binding check is the upgrade gate: a newer pin is no obstacle, and the project's stores are not read", () => {
  const candidate = { adapter, onboarded: [declared("review-kit")], lock: pinned(), installed: kit(ALL_SKILLS, { version: "1.9.0", checksum: "d".repeat(64) }) };
  assert.deepEqual(checkPluginBinding(candidate), { status: "ready" });
  assert.equal(checkPluginBinding({ ...candidate, installed: kit(["task"], { version: "1.9.0" }) }).step, "bound");
  assert.equal(checkPluginBinding({ ...candidate, installed: kit(ALL_SKILLS, { version: "2.0.0" }) }).step, "installed");
});

test("the upgrade gate refuses new content under the version the lock already pins", () => {
  const candidate = { adapter, onboarded: [declared("review-kit")], lock: pinned(), installed: kit(ALL_SKILLS, { checksum: "d".repeat(64) }) };
  const result = checkPluginBinding(candidate);
  assert.equal(result.step, "installed");
  assert.match(result.reason, /must not change under its own version: review-kit 1\.2\.0 \(dddddddddddd\) is installed, but onboarded\.lock\.json pins 1\.2\.0 \(aaaaaaaaaaaa\)/);
  assert.deepEqual(checkPluginBinding({ ...candidate, installed: kit(ALL_SKILLS) }), { status: "ready" });
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
  const storeless = { ...adapter, knowledgeStores: [] };
  const result = checkAdapterReadiness({
    ...facts,
    adapter: storeless,
    lock: pinned({ mappingDigest: mappingDigest(storeless) }),
    installed: kit(["task", "story-pre", "story-post"]),
    pluginStores: new Map(),
  });
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
  assert.equal(recoveryFor({ installed: new Map() }).action, "ask-user");
  assert.match(recoveryFor({ installed: new Map() }).message, /review-kit.*\^1\.0\.0.*github:example\/review-kit/);
  assert.equal(recoveryFor({ onboarded: [] }).action, "ask-user");
  assert.equal(recoveryFor({ installed: kit(["task"]) }).action, "ask-user");
});

test("the first failing step wins", () => {
  assert.equal(checkAdapterReadiness({ ...facts, onboarded: [], installed: new Map() }).step, "declared");
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

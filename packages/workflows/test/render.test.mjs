import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CODE_REVIEW_OPERATIONS, DISCOVERY_OPERATIONS, renderSkill, reviewToolkitAdapter } from "../dist/index.js";

const templateText = (operation) =>
  readFileSync(new URL(`../../../plugins/unified-plugin-framework/skills/${operation}/SKILL.md`, import.meta.url), "utf8");

const committedLock = JSON.parse(
  readFileSync(new URL("../../../plugins/unified-plugin-framework/onboarded.lock.json", import.meta.url), "utf8"),
);

const rendered = (operation) => renderSkill(templateText(operation), reviewToolkitAdapter, operation, committedLock);

test("templates never name a plugin; only the adapter does", () => {
  CODE_REVIEW_OPERATIONS.map((operation) => {
    assert.doesNotMatch(templateText(operation), /monolithic-code-review|review-setup|review-story-preflight/);
    return operation;
  });
});

test("Discovery templates name no plugin and no plugin skill either", () => {
  DISCOVERY_OPERATIONS.map((operation) => {
    assert.doesNotMatch(templateText(operation), /superpowers|bmad|brainstorming/i);
    return operation;
  });
});

test("rendering fills every placeholder from the adapter", () => {
  CODE_REVIEW_OPERATIONS.map((operation) => {
    const result = rendered(operation);
    assert.equal(result.ok, true, result.message);
    assert.doesNotMatch(result.text, /\{\{/);
    reviewToolkitAdapter.fulfil[operation].map(({ plugin, skill }) => assert.match(result.text, new RegExp(`${plugin}:${skill}`)));
    assert.match(result.text, /\.monolithic-code-review\/sources\.json/);
    assert.match(result.text, /monolithic-code-review-toolkit:review-setup/);
    assert.match(result.text, /setup-project-knowledge/);
    return operation;
  });
});

test("skills with several plugin skills list when to use each", () => {
  const text = rendered("review-story").text;
  assert.match(text, /review-story-preflight` — Before the pull request exists/);
  assert.match(text, /review-story-postflight` — Once the pull request is open/);
});

test("rendering rejects unknown placeholders and unknown operations", () => {
  assert.equal(renderSkill("{{surprise}}", reviewToolkitAdapter, "review-task", committedLock).ok, false);
  assert.equal(renderSkill("{{delegate}}", reviewToolkitAdapter, "review-everything", committedLock).ok, false);
});

test("the readiness step names the pinned toolkit version as a one-line heads-up, not a stop", () => {
  const text = rendered("review-task").text;
  assert.match(text, /This workflow is tested with `monolithic-code-review-toolkit` 0\.6\.0\./);
  assert.match(text, /mention it to the user once, in one line, and continue/);
});

test("rendering fails when a served plugin has no pin, naming the plugin and the fix", () => {
  const result = renderSkill(templateText("review-task"), reviewToolkitAdapter, "review-task", { lockVersion: 1, plugins: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /monolithic-code-review-toolkit has no pin in onboarded\.lock\.json: pin it with agent-plugin upgrade-check/);
});

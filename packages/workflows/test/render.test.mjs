import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CODE_REVIEW_OPERATIONS, renderSkill, reviewToolkitAdapter } from "../dist/index.js";

const templateText = (operation) =>
  readFileSync(new URL(`../templates/code-review/${operation}.md`, import.meta.url), "utf8");

const shippedSkill = (operation) =>
  readFileSync(new URL(`../../../plugins/unified-plugin-framework/skills/${operation}/SKILL.md`, import.meta.url), "utf8");

const rendered = (operation) => renderSkill(templateText(operation), reviewToolkitAdapter, operation);

test("templates never name a plugin; only the adapter does", () => {
  CODE_REVIEW_OPERATIONS.map((operation) => {
    assert.doesNotMatch(templateText(operation), /monolithic-code-review|review-setup|review-story-preflight/);
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
  assert.equal(renderSkill("{{surprise}}", reviewToolkitAdapter, "review-task").ok, false);
  assert.equal(renderSkill("{{delegate}}", reviewToolkitAdapter, "review-everything").ok, false);
});

test("shipped skills match their rendered templates", () => {
  CODE_REVIEW_OPERATIONS.map((operation) => {
    assert.equal(shippedSkill(operation), rendered(operation).text, `${operation}: run pnpm payloads:build`);
    return operation;
  });
});

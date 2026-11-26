import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CODE_REVIEW_OPERATIONS, DISCOVERY_OPERATIONS, brainstormingDiscoveryAdapter, renderSkill, reviewToolkitAdapter } from "../dist/index.js";

const templateText = (operation) =>
  readFileSync(new URL(`../../../skills/${operation}/SKILL.md`, import.meta.url), "utf8");

const committedLock = JSON.parse(
  readFileSync(new URL("../../../io.github.monolith-inc.upf/onboarded.lock.json", import.meta.url), "utf8"),
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
  const operations = new Set(CODE_REVIEW_OPERATIONS);
  CODE_REVIEW_OPERATIONS.map((operation) => {
    const result = rendered(operation);
    assert.equal(result.ok, true, result.message);
    assert.doesNotMatch(result.text, /\{\{/);
    reviewToolkitAdapter.fulfil[operation].map(({ plugin, skill }) => {
      const expected = operations.has(skill) ? `${plugin}-${skill}` : skill;
      assert.match(result.text, new RegExp(`\`${expected}\``));
    });
    assert.match(result.text, /\.monolithic-code-review\/sources\.json/);
    assert.match(result.text, /`review-setup`/);
    assert.match(result.text, /`setup-project-knowledge`/);
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
  assert.match(result.message, /monolithic-code-review-toolkit has no pin in io\.github\.monolith-inc\.upf\/onboarded\.lock\.json: pin it with agent-plugin upgrade-check/);
});

test("rendered discovery skills require offering fitting BMad paths before starting and non-empty knowledge readiness", () => {
  const result = renderSkill(templateText("discover-quick"), brainstormingDiscoveryAdapter, "discover-quick", committedLock);
  assert.equal(result.ok, true, result.message);
  assert.match(result.text, /Before starting the lead workflow, offer the user the fitting paths/);
  assert.match(result.text, /shared decision contract to select a channel that supports the complete multi-select question and custom answers/);
  assert.match(result.text, /otherwise use the contract's suitable canvas, numbered reply fallback, or resumable needs-input result/);
  assert.doesNotMatch(result.text, /ask one focused decision per tool call when a host supports single-choice pickers only/);
  assert.match(result.text, /host exposes `upf_discovery_question`.*saved discovery state, project language/);
  assert.match(result.text, /BCP 47 tag.*en or pt-BR/);
  assert.match(result.text, /If wording is missing, supply it and retry with the same state/);
  assert.match(result.text, /Use the returned state as the continuation/);
  assert.match(result.text, /When the tool is unavailable, use `agent-plugin question next <json>`/);
  assert.match(result.text, /## Presenting questions to the user/);
  assert.match(result.text, /### Shape & Ideate/);
  assert.match(result.text, /bmad-forge-idea/);
  assert.match(result.text, /never report ready while the store is empty/);
  assert.match(result.text, /query\.py curate/);
});

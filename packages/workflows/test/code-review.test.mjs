import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadPluginRoot } from "@agent-plugins/core";

import { CODE_REVIEW_OPERATIONS, adapterPlugins, findWorkflow, reviewToolkitAdapter } from "../dist/index.js";

const frameworkRoot = new URL("../../../plugins/unified-plugin-framework/", import.meta.url);

const skillText = (operation) => readFileSync(new URL(`skills/${operation}/SKILL.md`, frameworkRoot), "utf8");

test("the toolkit adapter is frozen and implements code review contract v1", () => {
  assert.equal(Object.isFrozen(reviewToolkitAdapter), true);
  assert.equal(Object.isFrozen(reviewToolkitAdapter.fulfil), true);
  assert.equal(reviewToolkitAdapter.contractVersion, "1.0.0");
  assert.deepEqual(Object.keys(reviewToolkitAdapter.fulfil).toSorted(), [...CODE_REVIEW_OPERATIONS].toSorted());
});

test("every contract operation has a framework skill naming each plugin skill and store it relies on", () => {
  CODE_REVIEW_OPERATIONS.map((operation) => {
    reviewToolkitAdapter.fulfil[operation].map(({ plugin, skill }) =>
      assert.ok(skillText(operation).includes(`${plugin}:${skill}`), `${operation} skill must name ${plugin}:${skill}`),
    );
    reviewToolkitAdapter.knowledgeStores.map(({ file, key }) =>
      assert.ok(skillText(operation).includes(file) && skillText(operation).includes(key.join(".")), `${operation} skill must name ${file}`),
    );
    return operation;
  });
});

test("the framework manifest declares every plugin the adapter references", () => {
  const declared = loadPluginRoot(new URL(frameworkRoot).pathname).onboardedPlugins ?? [];
  assert.ok(
    adapterPlugins(reviewToolkitAdapter).every((plugin) =>
      declared.some(({ name, adapter }) => name === plugin && adapter === "code-review"),
    ),
  );
});

test("findWorkflow returns the adapter for known names and nothing for anything else", () => {
  assert.equal(findWorkflow("code-review"), reviewToolkitAdapter);
  assert.equal(findWorkflow("toString"), undefined);
  assert.equal(findWorkflow("__proto__"), undefined);
});

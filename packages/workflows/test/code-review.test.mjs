import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WORKFLOW_ADAPTERS, loadPluginRoot } from "@agent-plugins/core";

import { CODE_REVIEW_OPERATIONS, WORKFLOWS, reviewToolkitAdapter } from "../dist/index.js";

const frameworkRoot = new URL("../../../plugins/unified-plugin-framework/", import.meta.url);

const skillText = (operation) =>
  readFileSync(new URL(`skills/${operation}/SKILL.md`, frameworkRoot), "utf8");

test("the toolkit adapter is frozen and implements code review contract v1", () => {
  assert.equal(Object.isFrozen(reviewToolkitAdapter), true);
  assert.equal(Object.isFrozen(reviewToolkitAdapter.fulfil), true);
  assert.equal(reviewToolkitAdapter.workflow, "code-review");
  assert.equal(reviewToolkitAdapter.contractVersion, "1.0.0");
});

test("every contract operation is fulfilled by at least one plugin skill", () => {
  assert.deepEqual(Object.keys(reviewToolkitAdapter.fulfil).toSorted(), [...CODE_REVIEW_OPERATIONS].toSorted());
  assert.ok(CODE_REVIEW_OPERATIONS.every((operation) => reviewToolkitAdapter.fulfil[operation].length > 0));
});

test("every contract operation has a framework skill that names each plugin skill it delegates to", () => {
  CODE_REVIEW_OPERATIONS.map((operation) =>
    reviewToolkitAdapter.fulfil[operation].map(({ plugin, skill }) =>
      assert.ok(skillText(operation).includes(`${plugin}:${skill}`), `${operation} skill must name ${plugin}:${skill}`),
    ),
  );
});

test("the framework manifest declares every plugin the adapter references", () => {
  const declared = loadPluginRoot(new URL(frameworkRoot).pathname).onboardedPlugins ?? [];
  const referenced = Object.values(reviewToolkitAdapter.fulfil).flat().map(({ plugin }) => plugin);
  assert.ok(
    referenced.every((plugin) => declared.some(({ name, adapter }) => name === plugin && adapter === "code-review")),
  );
});

test("the workflow registry matches the workflow names core accepts", () => {
  assert.deepEqual(Object.keys(WORKFLOWS).toSorted(), [...WORKFLOW_ADAPTERS].toSorted());
  assert.equal(WORKFLOWS["code-review"], reviewToolkitAdapter);
});

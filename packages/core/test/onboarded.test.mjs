import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { UPF_EXTENSION, diagnosticCodes, inspectPlugin, loadPluginRoot } from "../dist/index.js";

const reviewToolkit = {
  name: "monolithic-code-review-toolkit",
  version: "^1.0.0",
  source: "github:Monolith-INC/monolithic-code-review-toolkit",
  adapter: "code-review",
};

const manifestWith = (section) => ({
  name: "unified-plugin-framework",
  version: "0.1.0",
  extensions: { [UPF_EXTENSION]: section },
});

const codesAndPaths = (inspection) =>
  inspection.diagnostics.map(({ code, path }) => ({ code, path }));

const entryPath = (index, field) =>
  `extensions["${UPF_EXTENSION}"].onboardedPlugins[${index}]${field === undefined ? "" : `.${field}`}`;

test("declared onboarded plugins are listed with their version range, source and adapter", () => {
  const inspection = inspectPlugin(manifestWith({ onboardedPlugins: [reviewToolkit] }));

  assert.deepEqual(inspection.diagnostics, []);
  assert.deepEqual(inspection.onboardedPlugins, [reviewToolkit]);
});

test("a manifest without the extension is unchanged and lists no onboarded plugins", () => {
  const inspection = inspectPlugin({
    name: "plain-plugin",
    version: "1.0.0",
    extensions: { "com.example": { flag: true } },
  });

  assert.deepEqual(inspection.diagnostics, []);
  assert.equal("onboardedPlugins" in inspection, false);
});

test("missing fields, unknown adapters and duplicates name the entry and the problem", () => {
  const inspection = inspectPlugin(
    manifestWith({
      onboardedPlugins: [
        reviewToolkit,
        { name: "superpowers", source: "github:obra/superpowers", adapter: "code-review" },
        { ...reviewToolkit, name: "bmad-method", adapter: "discovery" },
        { ...reviewToolkit, version: "^2.0.0" },
      ],
    }),
  );

  assert.deepEqual(codesAndPaths(inspection), [
    { code: diagnosticCodes.onboardedPluginFieldRequired, path: entryPath(1, "version") },
    { code: diagnosticCodes.onboardedPluginAdapterUnknown, path: entryPath(2, "adapter") },
    { code: diagnosticCodes.onboardedPluginDuplicate, path: entryPath(3, "name") },
  ]);
  assert.ok(inspection.diagnostics.every(({ severity }) => severity === "error"));
  assert.deepEqual(inspection.onboardedPlugins, [reviewToolkit]);
});

test("an entry that is not an object is rejected", () => {
  const inspection = inspectPlugin(manifestWith({ onboardedPlugins: ["superpowers"] }));

  assert.deepEqual(codesAndPaths(inspection), [
    { code: diagnosticCodes.onboardedPluginInvalidType, path: entryPath(0) },
  ]);
});

test("a malformed extension section is rejected without listing plugins", () => {
  const malformed = [[], { onboardedPlugins: {} }, {}];

  malformed.map((section) => {
    const inspection = inspectPlugin(manifestWith(section));
    assert.deepEqual(codesAndPaths(inspection), [
      { code: diagnosticCodes.upfExtensionInvalid, path: `extensions["${UPF_EXTENSION}"]` },
    ]);
    assert.equal("onboardedPlugins" in inspection, false);
    return section;
  });
});

test("loadPluginRoot reads declarations from a plugin directory", () => {
  const inspection = loadPluginRoot(fileURLToPath(new URL("../../../fixtures/valid/onboarded-plugins", import.meta.url)));

  assert.deepEqual(inspection.diagnostics, []);
  assert.deepEqual(inspection.onboardedPlugins, [reviewToolkit]);
});

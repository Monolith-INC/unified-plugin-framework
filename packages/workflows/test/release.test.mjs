import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildVendorBundle, releasePayloads, SHIPPED_PLUGINS, withAssembledSource, withPayloadsRoot } from "../dist/index.js";

const framework = fileURLToPath(new URL("../../../", import.meta.url));

const unusedAdapter = Object.freeze({ vendor: "claude" });

test("the framework plugin is shipped", () => {
  assert.deepEqual([...SHIPPED_PLUGINS], ["unified-plugin-framework"]);
});

test("verify writes payloads to a scratch folder it removes; build keeps them in the package", () => {
  const packagePayloads = join(mkdtempSync(join(tmpdir(), "upf-package-")), "payloads");
  const seen = withPayloadsRoot("verify", packagePayloads, (root) => {
    writeFileSync(join(root, "probe"), "x");
    return root;
  });
  assert.notEqual(seen, packagePayloads);
  assert.equal(existsSync(seen), false);
  assert.equal(existsSync(packagePayloads), false);
  assert.equal(withPayloadsRoot("build", packagePayloads, (root) => root), packagePayloads);
});

test("withAssembledSource hands over an assembled copy and removes it afterwards", () => {
  const staged = withAssembledSource(framework, (root) => ({
    root,
    text: readFileSync(join(root, "skills", "review-task", "SKILL.md"), "utf8"),
  }));
  assert.equal(staged.ok, true);
  assert.match(staged.value.text, /monolithic-code-review-toolkit:review-task/);
  assert.equal(existsSync(staged.value.root), false);
});

test("building from a source directory that does not exist is reported, not thrown", () => {
  const missing = join(mkdtempSync(join(tmpdir(), "upf-release-missing-")), "no-such-plugin");
  const built = buildVendorBundle(missing, unusedAdapter);
  assert.equal(built.ok, false);
  assert.deepEqual(built.diagnostics.map(({ code }) => code), ["release.source.unreadable"]);
});

test("an unknown release operation is reported, not thrown", () => {
  const [report] = releasePayloads("publish", unusedAdapter, { pluginsRoot: "/nowhere", payloadsRoot: "/nowhere" });
  assert.equal(report.result.ok, false);
  assert.match(report.result.diagnostics[0].message, /build or verify/);
});

test("a shipped plugin that cannot be assembled is reported per plugin and nothing is built", () => {
  const pluginsRoot = mkdtempSync(join(tmpdir(), "upf-release-"));
  const payloadsRoot = mkdtempSync(join(tmpdir(), "upf-release-payloads-"));
  SHIPPED_PLUGINS.map((plugin) => {
    mkdirSync(join(pluginsRoot, plugin, "skills", "review-everything"), { recursive: true });
    writeFileSync(join(pluginsRoot, plugin, "skills", "review-everything", "SKILL.md"), "{{delegate}}\n");
    return plugin;
  });
  const reports = releasePayloads("build", unusedAdapter, { pluginsRoot, payloadsRoot });
  assert.deepEqual(reports.map(({ plugin }) => plugin), [...SHIPPED_PLUGINS]);
  reports.map(({ plugin, result }) => {
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, "release.assembly.failed");
    assert.equal(result.diagnostics[0].path, plugin);
    return result;
  });
  assert.deepEqual(readdirSync(payloadsRoot), []);
});

test("a shipped plugin whose directory and manifest names differ is reported and nothing is built", () => {
  const pluginsRoot = mkdtempSync(join(tmpdir(), "upf-release-names-"));
  const payloadsRoot = mkdtempSync(join(tmpdir(), "upf-release-names-payloads-"));
  SHIPPED_PLUGINS.map((plugin) => {
    mkdirSync(join(pluginsRoot, plugin), { recursive: true });
    writeFileSync(
      join(pluginsRoot, plugin, "plugin.json"),
      JSON.stringify({ name: `renamed-${plugin}`, version: "1.0.0", description: "Renamed.", schemaVersion: "1.0.0" }),
    );
    return plugin;
  });
  const reports = releasePayloads("build", unusedAdapter, { pluginsRoot, payloadsRoot });
  reports.map(({ plugin, result }) => {
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, "release.plugin.name_mismatch");
    assert.match(result.diagnostics[0].message, new RegExp(`plugins/${plugin} to plugins/renamed-${plugin}`));
    return plugin;
  });
  assert.deepEqual(readdirSync(payloadsRoot), []);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadPluginRoot } from "@agent-plugins/core";
import { fileURLToPath } from "node:url";
import {
  backlogTrackingAdapter as adapter, TRACKING_OPERATIONS, checkPluginBinding,
  checkAdapterReadiness, findWorkflow, mappingDigest, renderSkill, selectContent, providerLeak, pinFor,
} from "../dist/index.js";

const root = new URL("../../../plugins/unified-plugin-framework/", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("onboarded.lock.json", root), "utf8"));
const template = (name) => readFileSync(new URL(`skills/${name}/SKILL.md`, root), "utf8");
const pin = pinFor(lock, "agile-backlog-toolkit", "project-tracking");
const plugin = {
  version: pin.version, checksum: pin.checksum,
  skills: Object.values(adapter.fulfil).flat().map(({ skill }) => skill),
  contentSource: { checksum: "source", files: Object.fromEntries(adapter.contentViews.map(({ path, sourceDigest }) => [path, sourceDigest])) },
};
const facts = {
  adapter, lock, onboarded: loadPluginRoot(fileURLToPath(root)).onboardedPlugins,
  installed: new Map([[pin.plugin, plugin]]), projectStore: "/project/knowledge", pluginStores: new Map(),
};

test("tracking contract is total, registered, declared and pinned at the reviewed release", () => {
  assert.equal(findWorkflow("project-tracking"), adapter);
  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(Object.keys(adapter.fulfil), [...TRACKING_OPERATIONS]);
  assert.equal(pin.version, "0.12.1");
  assert.equal(pin.mappingDigest, mappingDigest(adapter));
  assert.deepEqual(checkAdapterReadiness(facts), { status: "ready" });
});

test("all entry points use provider-free reviewed content and the same project lifecycle", () => {
  TRACKING_OPERATIONS.map((operation) => {
    assert.doesNotMatch(template(operation), /agile-backlog-toolkit|generate-work-item|auto-fix-artifact|Azure|Linear|Jira|Confluence/i);
    const result = renderSkill(template(operation), adapter, operation, lock);
    assert.equal(result.ok, true, result.message);
    assert.doesNotMatch(result.text, /\{\{/);
    assert.equal(providerLeak(result.text), false);
    assert.match(result.text, /reviewed content excerpts/);
    assert.doesNotMatch(result.text, /Run `agile-backlog-toolkit:|Use `agile-backlog-toolkit:/);
    assert.match(result.text, /team template/);
    assert.match(result.text, /saved language/);
    assert.match(result.text, /uncertain create/);
    assert.match(result.text, /MIT License/);
    assert.match(result.text, /Théo Carranza/);
    return operation;
  });
  const full = template("track-from-design");
  ["track-enrich", "track-validate", "track-decompose", "track-split", "track-breakdown"].map((op) => assert.ok(full.includes(op)));
});

test("missing plugin, version drift, source drift and knowledge failures all carry recovery", () => {
  [
    { ...facts, installed: new Map() },
    { ...facts, installed: new Map([[pin.plugin, { ...plugin, version: "0.12.2" }]]) },
    { ...facts, installed: new Map([[pin.plugin, { ...plugin, checksum: "changed" }]]) },
    { ...facts, installed: new Map([[pin.plugin, { ...plugin, contentSource: { checksum: "source", files: {} } }]]) },
    { ...facts, projectStore: undefined },
  ].map((input) => {
    const result = checkAdapterReadiness(input);
    assert.equal(result.status, "not-ready");
    assert.ok(result.reason.length > 0);
    assert.ok(result.recovery);
    return result;
  });
  const changed = checkPluginBinding({ ...facts, installed: new Map([[pin.plugin, { ...plugin, contentSource: { checksum: "source", files: {} } }]]) });
  assert.match(changed.reason, /Published content differs/);
});

test("selection expansion accepts unchanged source while any previously pinned source change is rejected", () => {
  const before = { ...pin, contentSource: { checksum: "base", files: { "LICENSE": "old" } } };
  const expanded = { ...plugin, checksum: "expanded", contentSource: { checksum: "base", files: { "LICENSE": "old", "README.md": "new" } } };
  const input = { ...facts, adapter: { ...adapter, contentViews: [] }, lock: { lockVersion: 1, plugins: [before] } };
  assert.equal(checkPluginBinding({ ...input, installed: new Map([[pin.plugin, expanded]]) }).status, "ready");
  [
    { ...expanded, contentSource: { ...expanded.contentSource, checksum: "modified-skills" } },
    { ...expanded, contentSource: { ...expanded.contentSource, files: { "LICENSE": "changed" } } },
    { ...expanded, contentSource: { ...expanded.contentSource, files: {} } },
  ].map((candidate) => {
    assert.match(checkPluginBinding({ ...input, installed: new Map([[pin.plugin, candidate]]) }).reason, /release must not change/);
    return candidate;
  });
});

test("an incomplete content view or missing lifecycle cannot assemble", () => {
  assert.equal(renderSkill(template("track-enrich"), { ...adapter, contentViews: [] }, "track-enrich", lock).ok, false);
  assert.equal(renderSkill(template("track-enrich").replace("{{protocol}}", ""), adapter, "track-enrich", lock).ok, false);
});

test("content selection rejects missing, ambiguous and provider-specific source sections", () => {
  const selection = { plugin: "p", skill: "s", path: "references/rules.md", heading: "Rules", start: "## Rules", end: "## Next" };
  const select = (source) => selectContent(new Map([[selection.path, source]]), [selection]);
  assert.equal(select("## Rules\nKeep requirements.\n## Next").ok, true);
  ["## Rules\nNo end", "## Rules\n## Rules\n## Next", "## Rules\nContent\n## Next\n## Next", "## Rules\nUse Azure tools.\n## Next", "## Rules\nCall wit_update_work_item\n## Next"].map((source) => {
    assert.equal(select(source).ok, false);
    return source;
  });
  const source = "## Rules\r\nPreserve scope.\r\n## Next\r\n";
  assert.deepEqual(select(source), select(source.replaceAll("\r\n", "\n")));
  assert.equal(selectContent(new Map(), [selection]).ok, false);
});

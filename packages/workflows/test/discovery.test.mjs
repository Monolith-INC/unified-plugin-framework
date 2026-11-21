import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { declaredWorkflows, loadPluginRoot } from "@agent-plugins/core";

import {
  adapterPlugins,
  brainstormingDiscoveryAdapter,
  checkAdapterReadiness,
  DISCOVERY_OPERATIONS,
  findWorkflow,
  renderSkill,
  pinFor,
} from "../dist/index.js";

const framework = new URL("../../../", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("io.github.monolith-inc.upf/onboarded.lock.json", framework), "utf8"));
const template = (operation) => readFileSync(new URL(`skills/${operation}/SKILL.md`, framework), "utf8");
const rendered = (operation) => renderSkill(template(operation), brainstormingDiscoveryAdapter, operation, lock);

test("the discovery adapter is frozen, registered and implements Discovery contract v1", () => {
  assert.equal(Object.isFrozen(brainstormingDiscoveryAdapter), true);
  assert.equal(findWorkflow("discovery"), brainstormingDiscoveryAdapter);
  assert.equal(brainstormingDiscoveryAdapter.composition, "lead-and-layers");
  assert.deepEqual(Object.keys(brainstormingDiscoveryAdapter.fulfil).toSorted(), [...DISCOVERY_OPERATIONS].toSorted());
});

test("every mode is led by the same brainstorming flow; modes differ only in the layers they add", () => {
  DISCOVERY_OPERATIONS.map((operation) => {
    const [lead, ...layers] = brainstormingDiscoveryAdapter.fulfil[operation];
    assert.deepEqual([lead.plugin, lead.skill], ["superpowers", "brainstorming"]);
    assert.ok(layers.every(({ plugin }) => plugin === "bmad-method"), `${operation} layers come from BMad Method`);
    return operation;
  });
  assert.equal(brainstormingDiscoveryAdapter.fulfil["discover-quick"].length, 1);
  assert.ok(brainstormingDiscoveryAdapter.fulfil["discover-comprehensive"].length > brainstormingDiscoveryAdapter.fulfil["discover-thorough"].length);
});

test("the framework manifest declares and the lock pins every plugin the adapter needs", () => {
  const declared = loadPluginRoot(fileURLToPath(framework)).onboardedPlugins ?? [];
  adapterPlugins(brainstormingDiscoveryAdapter).map((plugin) => {
    assert.ok(declared.some((entry) => entry.name === plugin && declaredWorkflows(entry).includes("discovery")), `${plugin} is declared for discovery`);
    assert.ok(pinFor(lock, plugin, "discovery"), `${plugin} is pinned`);
    return plugin;
  });
});

test("rendered modes run the flow throughout, add their layers, offer the rest of the catalog once, and name BMad skills bare", () => {
  const thorough = rendered("discover-thorough");
  assert.equal(thorough.ok, true, thorough.message);
  assert.match(thorough.text, /Run `superpowers:brainstorming` throughout/);
  assert.match(thorough.text, /- `bmad-forge-idea` — Before the written design/);
  assert.match(thorough.text, /## Optional skills/);
  assert.match(thorough.text, /- `bmad-party-mode` — During the conversation/);
  assert.doesNotMatch(thorough.text.split("## Optional skills")[1].split("## Run the session")[0], /bmad-forge-idea/);
  assert.doesNotMatch(thorough.text, /bmad-method:/);
  assert.match(thorough.text, /install and enable `superpowers` and `bmad-method`/);
  assert.match(thorough.text, /tested with `superpowers` 7\.0\.0 and `bmad-method` 6\.12\.0/);
  assert.doesNotMatch(rendered("discover-quick").text, /Add these at the stages shown/);
});

test("Discovery readiness is all or nothing: a missing plugin fails it, naming the plugin", () => {
  const skills = (plugin) =>
    [...Object.values(brainstormingDiscoveryAdapter.fulfil).flat(), ...brainstormingDiscoveryAdapter.catalog]
      .filter((ref) => ref.plugin === plugin)
      .map(({ skill }) => skill);
  const pinOf = (plugin) => pinFor(lock, plugin, "implementation") ?? pinFor(lock, plugin, "discovery");
  const installed = (plugins) =>
    new Map(plugins.map((plugin) => [plugin, { version: pinOf(plugin).version, checksum: pinOf(plugin).checksum,
      contentSource: pinOf(plugin).contentSource, skills: skills(plugin) }]));
  const facts = {
    adapter: brainstormingDiscoveryAdapter,
    onboarded: loadPluginRoot(fileURLToPath(framework)).onboardedPlugins,
    lock,
    installed: installed(["superpowers", "bmad-method"]),
    projectStore: "/repo/knowledge",
    pluginStores: new Map(),
  };
  assert.deepEqual(checkAdapterReadiness(facts), { status: "ready" });
  const missing = checkAdapterReadiness({ ...facts, installed: installed(["superpowers"]) });
  assert.equal(missing.step, "installed");
  assert.match(missing.reason, /bmad-method/);
});

test("a mode that runs no BMad skill still checks that BMad is installed, because its catalog offers BMad skills", () => {
  const quick = rendered("discover-quick").text;
  assert.match(quick, /1\. \*\*Available:\*\* `superpowers:brainstorming` and `bmad-brainstorming` are available/);
});

test("the research mode still offers the adversarial lenses, which its verification layer does not cover", () => {
  const research = rendered("discover-research").text;
  assert.match(research.split("## Optional skills")[1].split("## Run the session")[0], /`bmad-review` — On the written design: run the adversarial/);
});

test("a template that drops the catalog placeholder while the mode offers a catalog is refused", () => {
  const result = renderSkill(template("discover-quick").replace("{{catalog}}", ""), brainstormingDiscoveryAdapter, "discover-quick", lock);
  assert.equal(result.ok, false);
  assert.match(result.message, /missing placeholders: \{\{catalog\}\}/);
});

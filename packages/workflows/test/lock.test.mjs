import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadPluginRoot } from "@agent-plugins/core";

import {
  adapterPlugins,
  EMPTY_LOCK,
  LOCK_FILE,
  lockText,
  mappingDigest,
  parseLock,
  pinFor,
  reviewToolkitAdapter,
  satisfiesRange,
  withPin,
} from "../dist/index.js";

const framework = new URL("../../../plugins/unified-plugin-framework/", import.meta.url);

const pin = (plugin, overrides = {}) => ({
  plugin,
  version: "1.0.0",
  checksum: "a".repeat(64),
  adapter: "code-review",
  contractVersion: "1.0.0",
  mappingDigest: "b".repeat(64),
  ...overrides,
});

test("satisfiesRange follows exact, caret and tilde ranges and fails closed on anything else", () => {
  const cases = [
    ["0.6.0", "^0.6.0", true],
    ["0.6.9", "^0.6.0", true],
    ["0.7.0", "^0.6.0", false],
    ["0.5.9", "^0.6.0", false],
    ["1.9.0", "^1.2.3", true],
    ["2.0.0", "^1.2.3", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true],
    ["1.3.0", "~1.2.3", false],
    ["1.2.3", "1.2.3", true],
    ["1.2.4", "1.2.3", false],
    ["1.0.0-beta.1", "^1.0.0", false],
    ["1.5.0", ">=1.0.0", false],
    ["1.5.0", "*", false],
  ];
  cases.map(([version, range, expected]) => {
    assert.equal(satisfiesRange(version, range), expected, `${version} in ${range}`);
    return version;
  });
});

test("parseLock accepts a complete lock and rejects incomplete, duplicate or unknown pins", () => {
  const lock = { lockVersion: 1, plugins: [pin("x"), pin("y")] };
  assert.deepEqual(parseLock(lock), { ok: true, lock });
  [
    { lockVersion: 2, plugins: [] },
    { lockVersion: 1, plugins: [pin("x"), pin("x")] },
    { lockVersion: 1, plugins: [pin("x", { checksum: "nope" })] },
    { lockVersion: 1, plugins: [pin("x", { adapter: "discovery" })] },
    { lockVersion: 1, plugins: [{ ...pin("x"), extra: "field" }] },
    { lockVersion: 1 },
    [],
  ].map((invalid) => {
    assert.equal(parseLock(invalid).ok, false);
    return invalid;
  });
});

test("withPin replaces a plugin's pin, keeps the lock sorted, and leaves the original untouched", () => {
  const lock = { lockVersion: 1, plugins: [pin("b"), pin("d")] };
  const next = withPin(withPin(lock, pin("c")), pin("b", { version: "2.0.0" }));
  assert.deepEqual(next.plugins.map(({ plugin, version }) => `${plugin}@${version}`), ["b@2.0.0", "c@1.0.0", "d@1.0.0"]);
  assert.deepEqual(lock.plugins.map(({ plugin }) => plugin), ["b", "d"]);
  assert.equal(pinFor(next, "c")?.version, "1.0.0");
  assert.equal(pinFor(EMPTY_LOCK, "c"), undefined);
});

test("lockText is stable, so re-pinning the same versions changes no bytes", () => {
  const lock = withPin(EMPTY_LOCK, pin("x"));
  assert.equal(lockText(lock), lockText(withPin(lock, pin("x"))));
  assert.deepEqual(parseLock(JSON.parse(lockText(lock))), { ok: true, lock });
});

test("mappingDigest changes whenever the mapping does", () => {
  const changed = {
    ...reviewToolkitAdapter,
    fulfil: { ...reviewToolkitAdapter.fulfil, "review-task": [{ plugin: "other", skill: "review-task" }] },
  };
  assert.match(mappingDigest(reviewToolkitAdapter), /^[0-9a-f]{64}$/);
  assert.notEqual(mappingDigest(changed), mappingDigest(reviewToolkitAdapter));
  assert.equal(mappingDigest({ ...reviewToolkitAdapter }), mappingDigest(reviewToolkitAdapter));
});

test("the committed lock pins every declared plugin against the current code review mapping", () => {
  const parsed = parseLock(JSON.parse(readFileSync(new URL(LOCK_FILE, framework), "utf8")));
  assert.equal(parsed.ok, true, parsed.message);
  const declared = loadPluginRoot(fileURLToPath(framework)).onboardedPlugins ?? [];
  adapterPlugins(reviewToolkitAdapter).map((plugin) => {
    const locked = pinFor(parsed.lock, plugin);
    const declaration = declared.find(({ name }) => name === plugin);
    assert.ok(locked, `${plugin} is pinned`);
    assert.ok(satisfiesRange(locked.version, declaration.version), `${plugin} ${locked.version} is inside ${declaration.version}`);
    assert.equal(locked.mappingDigest, mappingDigest(reviewToolkitAdapter), `${plugin} was pinned against the current mapping; run upgrade-check`);
    return plugin;
  });
});

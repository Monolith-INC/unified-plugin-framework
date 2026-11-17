import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NODE_PLUGIN_FACTS_IO } from "../dist/plugin-reader.js";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "upf-public-content-"));
  mkdirSync(join(root, "skills", "write"), { recursive: true });
  writeFileSync(join(root, "skills", "write", "SKILL.md"), "---\nname: write\ndescription: Write.\n---\nWrite.");
  mkdirSync(join(root, ".claude-plugin"));
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "p", version: "1.0.0" }));
  mkdirSync(join(root, "references"));
  writeFileSync(join(root, "references", "rules.md"), "Preserve requirements.\n");
  return root;
};

test("public references outside skill folders affect the binding checksum and normalize text", () => {
  const root = fixture();
  const references = new Map([["p", ["references/rules.md"]]]);
  const base = NODE_PLUGIN_FACTS_IO.readPlugin(root);
  const initial = NODE_PLUGIN_FACTS_IO.readPlugin(root, references);
  assert.equal(initial.ok, true);
  assert.notEqual(initial.value.checksum, base.value.checksum);
  writeFileSync(join(root, "references", "rules.md"), "Preserve requirements.\r\n");
  assert.deepEqual(NODE_PLUGIN_FACTS_IO.readPlugin(root, references), initial);
  writeFileSync(join(root, "references", "rules.md"), "Changed rule.\n");
  assert.notEqual(NODE_PLUGIN_FACTS_IO.readPlugin(root, references).value.checksum, initial.value.checksum);
  assert.deepEqual(NODE_PLUGIN_FACTS_IO.readPlugin(root, new Map([["other", ["missing.md"]]])), base);
});

test("unsafe or missing content references fail before pinning", () => {
  const root = fixture();
  ["../outside.md", "/absolute.md", "missing.md"].map((path) => {
    assert.equal(NODE_PLUGIN_FACTS_IO.readPlugin(root, new Map([["p", [path]]])).ok, false);
    return path;
  });
});

test("content references cannot follow a symlink", { skip: process.platform === "win32" }, () => {
  const root = fixture();
  symlinkSync(join(root, "references"), join(root, "linked"));
  assert.equal(NODE_PLUGIN_FACTS_IO.readPlugin(root, new Map([["p", ["linked/rules.md"]]])).ok, false);
});

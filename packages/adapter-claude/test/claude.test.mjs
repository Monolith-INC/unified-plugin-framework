import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileVendorPayload, createJsonPayloadFile, finalizeVendorBundle, normalizeCanonicalPlugin, readVendorBundle } from "@agent-plugins/compiler";
import { assertAdapterModuleHasNoFilesystemEffects, assertVendorAdapterConformance } from "@agent-plugins/testing";
import {
  CLAUDE_ADAPTER_VERSION,
  CLAUDE_SCHEMA_EVIDENCE,
  CLAUDE_SCHEMA_VERSION,
  claudeAdapter,
  compileClaudePayload,
  planClaudeInstallation,
  validateClaudeBundle,
} from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const helloWorldRoot = join(repositoryRoot, "plugins", "hello-world");

function richCanonical(overrides = {}) {
  return {
    root: helloWorldRoot,
    manifest: { name: "hello-world", version: "1.0.0", description: "Claude fixture." },
    skills: [{
      name: "hello-world",
      path: "skills/hello-world/SKILL.md",
      description: "Say hello.",
      content: "---\nname: hello-world\ndescription: Say hello.\n---\n\n# Hello\n",
    }],
    mcpServers: [{ transport: "stdio", name: "local", command: "node", args: ["server.mjs"] }],
    rules: [],
    hookIntents: [{
      id: "audit-shell",
      lifecycle: "before-tool",
      toolKinds: ["shell"],
      executable: "scripts/audit.sh",
      arguments: ["--check"],
      timeoutSeconds: 10,
    }],
    distribution: { schemaVersion: "1.0.0", compatibility: { bundleSchemaMajor: 1, allowDowngradeWithinMajor: false } },
    sourceDigest: "0".repeat(64),
    ...overrides,
  };
}

test("Claude schema evidence and adapter identity are pinned", () => {
  assert.equal(CLAUDE_ADAPTER_VERSION, "1.0.0");
  assert.equal(CLAUDE_SCHEMA_VERSION, "claude-code-plugins-2026-08-10");
  assert.deepEqual(CLAUDE_SCHEMA_EVIDENCE, [
    "https://code.claude.com/docs/en/plugins-reference",
    "https://code.claude.com/docs/en/hooks",
  ]);
  assert.equal(claudeAdapter.vendor, "claude");
});

test("Claude adapter renders native manifest, Skill, hook, and MCP payload", () => {
  const draft = compileClaudePayload(richCanonical());
  assert.equal(draft.ok, true);
  const bundle = finalizeVendorBundle(draft.value);
  assert.equal(bundle.ok, true);
  assert.deepEqual(bundle.value.files.map((file) => file.path), [
    ".claude-plugin/plugin.json",
    ".mcp.json",
    "hooks/hooks.json",
    "skills/hello-world/SKILL.md",
  ]);
  assert.deepEqual(validateClaudeBundle(bundle.value), []);
  const manifest = JSON.parse(new TextDecoder().decode(bundle.value.files[0].content));
  assert.deepEqual(manifest, {
    description: "Claude fixture.",
    name: "hello-world",
    version: "1.0.0",
  });
  const hooks = JSON.parse(new TextDecoder().decode(bundle.value.files[2].content));
  assert.deepEqual(hooks, {
    hooks: { PreToolUse: [{ hooks: [{ command: '"scripts/audit.sh" "--check"', timeout: 10, type: "command" }], matcher: "Bash" }] },
  });
  const plan = planClaudeInstallation(bundle.value, { root: "/unused" });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.value.writes.map((write) => write.destination), bundle.value.files.map((file) => file.path));
});

const MANIFEST = ".claude-plugin/plugin.json";
const manifestOf = (bundle) => JSON.parse(new TextDecoder().decode(bundle.files.find(({ path }) => path === MANIFEST).content));
/** The same bundle with its Claude manifest replaced, digests recomputed. */
const withManifest = (bundle, manifest) => {
  const file = createJsonPayloadFile({ path: MANIFEST, value: manifest });
  assert.equal(file.ok, true);
  const rebuilt = finalizeVendorBundle({
    plugin: bundle.manifest.plugin,
    vendor: bundle.manifest.vendor,
    adapter: bundle.manifest.adapter,
    sourceDigest: bundle.manifest.sourceDigest,
    files: [file.value, ...bundle.files.filter(({ path }) => path !== MANIFEST)],
  });
  assert.equal(rebuilt.ok, true);
  return rebuilt.value;
};

test("Claude adapter carries the portable author and license into the manifest", () => {
  const author = { name: "Monolith-INC", url: "https://github.com/Monolith-INC" };
  const draft = compileClaudePayload(richCanonical({
    manifest: { name: "hello-world", version: "1.0.0", description: "Claude fixture.", author, license: "Apache-2.0" },
  }));
  assert.equal(draft.ok, true);
  const bundle = finalizeVendorBundle(draft.value);
  assert.equal(bundle.ok, true);
  assert.deepEqual(manifestOf(bundle.value), { author, description: "Claude fixture.", license: "Apache-2.0", name: "hello-world", version: "1.0.0" });
  assert.deepEqual(validateClaudeBundle(bundle.value), []);
  const codes = (manifest) => validateClaudeBundle(withManifest(bundle.value, { ...manifestOf(bundle.value), ...manifest })).map(({ code }) => code);
  assert.deepEqual(codes({ author: { name: " " } }), ["claude.manifest.author"]);
  assert.deepEqual(codes({ license: 2 }), ["claude.manifest.license"]);
});

test("Claude adapter still accepts released bundles that declared default component paths", () => {
  const draft = compileClaudePayload(richCanonical());
  assert.equal(draft.ok, true);
  const bundle = finalizeVendorBundle(draft.value);
  assert.equal(bundle.ok, true);
  const legacy = { ...manifestOf(bundle.value), skills: "./skills/", hooks: "./hooks/hooks.json", mcpServers: "./.mcp.json" };
  assert.deepEqual(validateClaudeBundle(withManifest(bundle.value, legacy)), []);
  assert.deepEqual(
    validateClaudeBundle(withManifest(bundle.value, { ...legacy, skills: "./elsewhere/" })).map(({ code, path }) => [code, path]),
    [["claude.manifest.component", "skills"]],
  );
});

test("Claude adapter rejects unrepresentable rules and poisoned payloads", () => {
  const rule = compileClaudePayload(richCanonical({
    rules: [{ id: "safe-edits", activation: "always", fileGlobs: [], content: "Keep edits safe.\n" }],
  }));
  assert.equal(rule.ok, false);
  assert.equal(rule.diagnostics[0].code, "claude.rule.unsupported");

  const configPath = compileClaudePayload(richCanonical({
    mcpServers: [{ transport: "config-path", name: "opaque", path: "vendor.json" }],
  }));
  assert.equal(configPath.ok, false);
  assert.equal(configPath.diagnostics[0].code, "claude.mcp.unsupported");

  const valid = compileClaudePayload(richCanonical());
  assert.equal(valid.ok, true);
  const bundle = finalizeVendorBundle(valid.value);
  assert.equal(bundle.ok, true);
  const poisoned = { ...bundle.value, files: [{ ...bundle.value.files[0], path: "claude-owned-outside-adapter.json" }, ...bundle.value.files.slice(1)] };
  assert.ok(validateClaudeBundle(poisoned).length > 0);
});

test("Claude adapter passes the shared pure conformance harness", () => {
  const canonical = normalizeCanonicalPlugin(helloWorldRoot);
  assert.equal(canonical.ok, true);
  const evidence = assertVendorAdapterConformance({
    adapter: claudeAdapter,
    plugin: canonical.value,
    target: { root: join(mkdtempSync(join(tmpdir(), "claude-target-")), "install") },
  });
  assert.equal(evidence.vendor, "claude");
  assertAdapterModuleHasNoFilesystemEffects(readFileSync(join(packageRoot, "src", "index.ts"), "utf8"), "Claude adapter");
});

test("hello-world builds a valid, complete Claude payload", () => {
  const output = join(mkdtempSync(join(tmpdir(), "claude-hello-world-")), "bundle");
  assert.equal(compileVendorPayload({ source: helloWorldRoot, vendor: "claude", output }, claudeAdapter).ok, true);
  const shipped = readVendorBundle(output);
  assert.equal(shipped.ok, true);
  assert.deepEqual(validateClaudeBundle(shipped.value), []);
});

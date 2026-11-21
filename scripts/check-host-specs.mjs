#!/usr/bin/env node
// Specification conformance and host-spec drift verification (offline PR check + optional --upstream check).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CLAUDE_ADAPTER_VERSION, CLAUDE_SCHEMA_EVIDENCE, CLAUDE_SCHEMA_VERSION } from "../packages/adapter-claude/dist/index.js";
import { CODEX_ADAPTER_VERSION, CODEX_SCHEMA_EVIDENCE, CODEX_SCHEMA_VERSION } from "../packages/adapter-codex/dist/index.js";
import { CURSOR_SCHEMA_EVIDENCE, CURSOR_SCHEMA_VERSION } from "../packages/adapter-cursor/dist/index.js";
import { loadPluginRoot, MCP_SCHEMA_URL, PLUGIN_SCHEMA_URL, SUPPORTED_SCHEMA_VERSION } from "../packages/core/dist/index.js";
import { HOST_SPECS, HOST_SPECS_FILE, hasValidSkillFrontmatter, hostSpecMatches } from "../packages/cli/dist/host-specs.js";
import { HOSTS } from "../packages/cli/dist/host-table.js";
import { hasMaksHooks, installSkills, wireMaks, wireMaksHooks } from "../packages/cli/dist/tooling-runtime.js";

const REPO = resolve(import.meta.dirname, "..");
const UPSTREAM = process.argv.includes("--upstream");
const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const readEvidence = async (pkg) =>
  JSON.parse(await readFile(join(REPO, "packages", pkg, "schema", "evidence.json"), "utf8"));

const verifyEvidenceConsistency = async () => {
  const [claude, codex, cursor] = await Promise.all([
    readEvidence("adapter-claude"),
    readEvidence("adapter-codex"),
    readEvidence("adapter-cursor"),
  ]);
  assert.equal(claude.snapshot, CLAUDE_SCHEMA_VERSION, "adapter-claude evidence snapshot mismatch");
  assert.deepEqual(claude.sources, [...CLAUDE_SCHEMA_EVIDENCE], "adapter-claude evidence sources mismatch");
  assert.equal(codex.snapshot, CODEX_SCHEMA_VERSION, "adapter-codex evidence snapshot mismatch");
  assert.deepEqual(codex.sources, [...CODEX_SCHEMA_EVIDENCE], "adapter-codex evidence sources mismatch");
  assert.equal(cursor.snapshot, CURSOR_SCHEMA_VERSION, "adapter-cursor evidence snapshot mismatch");
  assert.deepEqual(cursor.sources, [...CURSOR_SCHEMA_EVIDENCE], "adapter-cursor evidence sources mismatch");

  assert.equal(HOST_SPECS.claude.adapterVersion, CLAUDE_ADAPTER_VERSION);
  assert.equal(HOST_SPECS.claude.vendorSchemaVersion, CLAUDE_SCHEMA_VERSION);
  assert.equal(HOST_SPECS.codex.adapterVersion, CODEX_ADAPTER_VERSION);
  assert.equal(HOST_SPECS.codex.vendorSchemaVersion, CODEX_SCHEMA_VERSION);
  return { claude, codex, cursor };
};

const verifyAgentPluginsConformance = async () => {
  const root = loadPluginRoot(REPO);
  assert.equal(root.manifest?.$schema, PLUGIN_SCHEMA_URL, "root plugin.json must declare v1.0.0 $schema");
  assert.deepEqual(root.diagnostics.filter((d) => d.severity === "error"), [], "root plugin must validate cleanly");

  // Manifest-first rejection per https://agent-plugins.org/client-implementers/loading-and-discovery
  const broken = await mkdtemp(join(tmpdir(), "upf-spec-broken-"));
  try {
    await mkdir(join(broken, "skills/hello"), { recursive: true });
    await writeFile(join(broken, "skills/hello/SKILL.md"), "---\nname: hello\ndescription: test\n---\n# Hello\n");
    await writeFile(join(broken, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/9.9.9/plugin.schema.json", name: "future" }));
    const rejected = loadPluginRoot(broken);
    assert.equal(rejected.manifest, undefined);
    assert.equal(rejected.skills, undefined, "fatal manifest rejection must not load skills");
    assert.equal(rejected.mcpServers, undefined, "fatal manifest rejection must not load MCP servers");
  } finally {
    await rm(broken, { recursive: true, force: true });
  }
};

const verifyZeroCliMaterialization = async () => {
  const project = await mkdtemp(join(tmpdir(), "upf-spec-materialize-"));
  try {
    for (const host of ["codex", "claude"]) {
      const ctx = { project, canonical: project, claudeState: join(project, ".no-claude.json"), tools: join(project, ".upf-tools"), python: "python3" };
      assert.equal((await HOSTS[host].register(ctx)).ok, true, `${host}: register spec receipt`);
      assert.equal((await installSkills(project, host)).ok, true, `${host}: materialize framework skills`);
      assert.equal((await wireMaks(project, "python3")).ok, true, `${host}: wire maks launcher`);
      assert.equal((await wireMaksHooks(project, host)).ok, true, `${host}: wire host hooks`);

      const receipt = JSON.parse(await readFile(join(project, HOST_SPECS_FILE), "utf8"));
      assert.equal(hostSpecMatches(receipt, host), true, `${host}: spec receipt must match pinned version`);

      const discovered = await HOSTS[host].discover(ctx);
      assert.equal(discovered.ok, true, `${host}: zero-CLI discovery must succeed`);
      assert.ok(discovered.value.length >= 28, `${host}: expected all framework skills discovered`);
      for (const skill of discovered.value) {
        const text = await readFile(skill.path, "utf8");
        assert.equal(hasValidSkillFrontmatter(text, skill.name), true, `${host}: invalid frontmatter in ${skill.path}`);
        assert.equal(/\{\{[a-z]+\}\}/.test(text), false, `${host}: raw template placeholder leaked in ${skill.path}`);
      }

      const hooksDoc = JSON.parse(await readFile(join(project, HOST_SPECS[host].hooksFile), "utf8"));
      assert.equal(hasMaksHooks(hooksDoc, HOST_SPECS[host].includeStopHook), true, `${host}: hooks file missing MAKS hooks`);
    }
    return project;
  } finally {
    await rm(project, { recursive: true, force: true });
  }
};

const checkUpstreamUrl = async (url, expectJson) => {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  if (!response.ok) return { url, ok: false, status: response.status };
  if (expectJson) JSON.parse(text);
  return { url, ok: true, status: response.status, sha256Prefix: digest(text) };
};

const verifyCodexLiveDiscovery = async () => {
  const project = await mkdtemp(join(tmpdir(), "upf-spec-codex-live-"));
  try {
    assert.equal((await installSkills(project, "codex")).ok, true);
    const result = await new Promise((resolveRun) => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], { cwd: project, stdio: ["pipe", "pipe", "ignore"] });
      child.on("error", () => resolveRun({ skipped: true }));
      let buffer = "";
      const timer = setTimeout(() => { child.kill("SIGTERM"); resolveRun({ ok: false, reason: "timeout" }); }, 20_000);
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.id === 1) {
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized" })}\n`);
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "skills/list", params: { cwds: [project], forceReload: true } })}\n`);
          } else if (msg.id === 2) {
            clearTimeout(timer);
            child.kill("SIGTERM");
            const data = msg.result?.data ?? [];
            const errors = data.flatMap((entry) => entry.errors ?? []);
            const repoSkills = data.flatMap((entry) => entry.skills ?? []).filter((skill) => skill.scope === "repo");
            resolveRun({ ok: errors.length === 0 && repoSkills.length >= 28, errors, discoveredCount: repoSkills.length });
          }
        }
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "upf-spec-check", version: "1.0.0" } } })}\n`);
    });
    if (!result.skipped) {
      assert.equal(result.ok, true, `Codex live discovery failed: ${JSON.stringify(result)}`);
    }
    return result;
  } finally {
    await rm(project, { recursive: true, force: true });
  }
};

const evidence = await verifyEvidenceConsistency();
await verifyAgentPluginsConformance();
await verifyZeroCliMaterialization();

const summary = {
  ok: true,
  agentPluginsSpec: SUPPORTED_SCHEMA_VERSION,
  hostSpecs: Object.fromEntries(Object.entries(HOST_SPECS).map(([host, spec]) => [host, spec.vendorSchemaVersion])),
};

if (UPSTREAM) {
  const schemaChecks = await Promise.all([
    checkUpstreamUrl(PLUGIN_SCHEMA_URL, true),
    checkUpstreamUrl(MCP_SCHEMA_URL, true),
  ]);
  const evidenceUrls = [...new Set([...evidence.claude.sources, ...evidence.codex.sources, ...evidence.cursor.sources])];
  const docChecks = await Promise.all(evidenceUrls.map((url) => checkUpstreamUrl(url, false)));
  const codexLive = await verifyCodexLiveDiscovery();
  const failedSchemas = schemaChecks.filter((entry) => !entry.ok);
  assert.equal(failedSchemas.length, 0, `Official Agent Plugins schemas unreachable: ${JSON.stringify(failedSchemas)}`);
  summary.upstream = { schemas: schemaChecks, docs: docChecks, codexLive };
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

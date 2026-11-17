import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkoutDir, parseSource, rootArg, sourcesFor } from "../dist/dependency-sources.js";
import { fetchSources } from "../dist/dependency-fetch.js";
import { NODE_PLUGIN_FACTS_IO } from "../dist/plugin-reader.js";
import { nodeToolingIO } from "../dist/tooling-node.js";
import { TOOLKIT_SKILLS, fakeToolkit, framework, frameworkPinning } from "./onboarded-helpers.mjs";

const WORKFLOWS = ["code-review", "discovery", "project-tracking", "continuity", "implementation"];

/** A fetch capability that copies a local tree to where the source's plugin folder would be, and records each call. */
const fakeFetcher = (tree) => {
  const calls = [];
  return {
    calls,
    fetcher: {
      fetch: async (source, into) => {
        calls.push(source);
        cpSync(tree, join(into, source.path), { recursive: true });
        return { ok: true, value: into };
      },
    },
  };
};

const context = (fetcher, frameworkRoot) => {
  const project = mkdtempSync(join(tmpdir(), "upf-fetch-"));
  return { project, cache: join(project, ".upf-tools/sources"), framework: frameworkRoot, workflows: ["code-review"], io: NODE_PLUGIN_FACTS_IO, fetcher };
};
const reviewSources = (frameworkRoot) => sourcesFor(NODE_PLUGIN_FACTS_IO, frameworkRoot, ["code-review"], []).value;

test("a github source maps its pin to the v<version> tag unless it names a ref, and keeps the plugin folder", () => {
  assert.deepEqual(parseSource("kit", "1.2.3", "github:owner/repo"),
    { plugin: "kit", version: "1.2.3", repository: "https://github.com/owner/repo.git", ref: "v1.2.3", path: "" });
  assert.deepEqual(parseSource("kit", "1.2.3", "github:owner/repo/plugins/kit#0123abc"),
    { plugin: "kit", version: "1.2.3", repository: "https://github.com/owner/repo.git", ref: "0123abc", path: "plugins/kit" });
  ["npm:kit", "github:owner", "github:-x/repo", "github:owner/repo/../up", "github:owner/repo#-c", "github:owner/repo#a/../b"]
    .map((declared) => assert.equal(parseSource("kit", "1.2.3", declared), undefined, declared));
});

test("the framework declares a fetchable pinned source for every onboarded plugin", () => {
  const planned = sourcesFor(NODE_PLUGIN_FACTS_IO, framework, WORKFLOWS, []);
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.deepEqual(planned.value.map(({ plugin, version, repository, ref, path }) => [plugin, version, repository, ref, path]).sort(), [
    ["agent-continuity", "0.13.0", "https://github.com/Monolith-INC/agent-continuity.git", "v0.13.0", ""],
    ["agile-backlog-toolkit", "0.12.1", "https://github.com/theocarranza/agile-backlog-toolkit.git", "v0.12.1", ""],
    ["bmad-method", "6.12.0", "https://github.com/bmad-code-org/BMAD-METHOD.git", "1cbcfa272fe65787c06a1fa164a901f46117cca7", ""],
    ["monolithic-code-review-toolkit", "0.6.0", "https://github.com/Monolith-INC/monolithic-code-review-toolkit.git", "v0.6.0", "plugins/monolithic-code-review-toolkit"],
    ["superpowers", "7.0.0", "https://github.com/obra/superpowers.git", "v7.0.0", ""],
  ]);
});

test("an explicit plugin root overrides fetching that plugin", () => {
  const toolkit = fakeToolkit(TOOLKIT_SKILLS);
  assert.deepEqual(sourcesFor(NODE_PLUGIN_FACTS_IO, framework, ["code-review"], [{ path: toolkit, name: undefined, version: undefined }]).value, []);
  assert.deepEqual(sourcesFor(NODE_PLUGIN_FACTS_IO, framework, ["code-review"], [{ path: toolkit, name: "monolithic-code-review-toolkit", version: undefined }]).value, []);
});

test("a fetched source that matches its pin is cached once and resolves to a pinned root", async () => {
  const toolkit = fakeToolkit(TOOLKIT_SKILLS);
  const pinned = frameworkPinning(toolkit);
  const { calls, fetcher } = fakeFetcher(toolkit);
  const run = context(fetcher, pinned);
  const sources = reviewSources(pinned);
  assert.deepEqual((await fetchSources(run, sources)).ok, true);
  assert.deepEqual(calls.map(({ ref }) => ref), ["v0.6.0"]);
  assert.equal(existsSync(join(checkoutDir(run.cache, sources[0]), "plugins/monolithic-code-review-toolkit/plugin.json")), true);
  assert.equal(rootArg(run.cache, sources[0]),
    `monolithic-code-review-toolkit@0.6.0=${join(run.cache, "monolithic-code-review-toolkit@0.6.0", "plugins/monolithic-code-review-toolkit")}`);
  assert.equal((await fetchSources(run, sources)).ok, true);
  assert.equal(calls.length, 1);
});

test("a fetched tree that differs from its pin is a typed failure and is never cached", async () => {
  const pinned = frameworkPinning(fakeToolkit(TOOLKIT_SKILLS));
  const { fetcher } = fakeFetcher(fakeToolkit([...TOOLKIT_SKILLS, "unreviewed"]));
  const run = context(fetcher, pinned);
  const result = await fetchSources(run, reviewSources(pinned));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "dependency-fetch-mismatch");
  assert.deepEqual(readdirSync(run.cache), []);
});

test("a failed fetch is reported and leaves no partial checkout", async () => {
  const pinned = frameworkPinning(fakeToolkit(TOOLKIT_SKILLS));
  const failure = { ok: false, error: { code: "dependency-fetch", message: "unreachable", recovery: "retry" } };
  const run = context({ fetch: async () => failure }, pinned);
  assert.deepEqual(await fetchSources(run, reviewSources(pinned)), failure);
  assert.deepEqual(readdirSync(run.cache), []);
});

test("a fresh project without plugin roots reports its dependencies as missing, to be fetched", async () => {
  const project = mkdtempSync(join(tmpdir(), "upf-fresh-"));
  const input = { host: "codex", python: "python3.12", workflows: ["code-review"], pluginRoots: [],
    knowledge: { knowledgeRoot: "knowledge", documentMode: "shared", docsRoot: "docs", vaultRoot: "docs" } };
  const observed = await nodeToolingIO(project, input).inspect("dependencies")();
  assert.equal(observed.ok, true, JSON.stringify(observed));
  assert.equal(observed.value.status, "missing");
  assert.match(observed.value.recovery, /monolithic-code-review-toolkit/);
});

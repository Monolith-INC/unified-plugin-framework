// Shared fixtures for the adapter-check and upgrade-check tests.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeCanonicalPlugin } from "@agent-plugins/compiler";
import { mappingDigest, reviewToolkitAdapter } from "@agent-plugins/workflows";


export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
export const framework = join(repoRoot, "plugins/unified-plugin-framework");

export const TOOLKIT_SKILLS = ["review-task", "review-story-preflight", "review-story-postflight", "review-feature", "review-setup"];

export const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
};

export const fakeToolkit = (skills, version = "0.6.0") => {
  const root = mkdtempSync(join(tmpdir(), "upf-toolkit-"));
  writeJson(join(root, "plugin.json"), { name: "monolithic-code-review-toolkit", version });
  skills.map((skill) => writeJson(join(root, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: Test skill.\n---\n`));
  return root;
};

export const digestOf = (root) => {
  const canonical = normalizeCanonicalPlugin(root);
  assert.equal(canonical.ok, true);
  return canonical.value.sourceDigest;
};

/** A copy of the framework plugin whose lock pins `toolkit` against the current code review mapping. */
export const frameworkPinning = (toolkit) => {
  const root = join(mkdtempSync(join(tmpdir(), "upf-framework-")), "unified-plugin-framework");
  cpSync(framework, root, { recursive: true });
  writeJson(join(root, "onboarded.lock.json"), {
    lockVersion: 1,
    plugins: [
      {
        plugin: "monolithic-code-review-toolkit",
        version: JSON.parse(readFileSync(join(toolkit, "plugin.json"), "utf8")).version,
        checksum: digestOf(toolkit),
        adapter: "code-review",
        contractVersion: "1.0.0",
        mappingDigest: mappingDigest(reviewToolkitAdapter),
      },
    ],
  });
  return root;
};

/** `review`: a store path, `null`, "absent" (no sources.json), or { raw } for literal file text. */
export const project = ({ review = "knowledge" } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "upf-project-"));
  mkdirSync(join(root, "knowledge"), { recursive: true });
  writeJson(join(root, ".project-knowledge.json"), { schemaVersion: 1, knowledgeRoot: "knowledge" });
  const sources = join(root, ".monolithic-code-review/sources.json");
  if (review !== "absent") writeJson(sources, review?.raw ?? { knowledge: { root: review } });
  return root;
};

/** A recording interpreter for the command's injected effects; reads go to the real temp files. */
export const recordingIo = (base) => {
  const lines = { out: [], err: [] };
  return {
    lines,
    io: { ...base, out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) },
  };
};

export const capture = (action) => {
  const original = { log: console.log, error: console.error };
  const output = { stdout: "", stderr: "" };
  console.log = (value) => {
    output.stdout += `${value}\n`;
  };
  console.error = (value) => {
    output.stderr += `${value}\n`;
  };
  try {
    return { exitCode: action(), ...output };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
};

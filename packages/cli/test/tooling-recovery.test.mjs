import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { RECOVERY_CODES, UNEXPECTED, exitCodeOf, headlessDiscovery, recoveryFor } from "../dist/tooling-recovery.js";

const expected = {
  auto: ["network-unavailable", "checksum-mismatch", "python-missing", "invalid-saved-plan", "stale-lock", "write-busy", "host-cli-missing", "tool-timeout", "tool-command-failed", "partial-step", "dependency-fetch", "knowledge-discovery-needed", "tooling-missing", "host-unavailable", "host-skill-errors", "host-activation-needed", "tooling-storage"],
  "hand-off": ["review-setup-needed", "continuity-setup-needed"],
  "user-action": ["host-sign-in-needed", "tracker-attention", "authentication-needed", "connection-unavailable", "tracker-error", "outcome-unknown", "invalid-reply", "invalid-scope", "setup-needed", "invalid-pagination", "invalid-parent", "invalid-request", "not-found", "outside-project", "unmapped-kind", "unmapped-state", "unsupported-operation"],
  stop: ["platform-unsupported", "extractor-missing", "unsupported-runtime", "invalid-settings", "write-denied", "storage-error", "project-busy", "invalid-json", "unreadable-input", "usage", "answers-required", "invalid-bootstrap", "host-required", "distribution-incomplete", "handoff-storage", "missing-input"],
  preserve: ["host-configuration-conflict", "settings-changed", "unsupported-settings", "symlink-escape", "modified-file", "unmanaged-file", "active-skill-drift", "dependency-fetch-mismatch", "dependency-source", "dependency-pin", "dependency-binding", "artifact-conflict", "invalid-local-store"],
};

test("discovery runs zero-MCP stdlib query.py curate without legacy MCP servers", () => {
  const input = { project: "/repo with spaces", python: "python3.12", queryScript: "/repo with spaces/.upf-tools/plugins/monolithic-agent-knowledge-store/source/scripts/query.py", isolatedDirectory: "/isolated/session", knowledgeRoot: "/repo with spaces/Project_Knowledge" };
  const codex = headlessDiscovery("codex", input);
  assert.equal(codex[codex.indexOf("-C") + 1], input.project);
  assert.ok(codex.includes("--ignore-user-config"));
  assert.ok(!codex.some((arg) => arg.includes("mcp_servers.")));
  assert.match(codex.at(-1), /query\.py" curate --project/);
  assert.match(codex.at(-1), /query\.py" catalog --project/);
  assert.match(codex.at(-1), /Do not run `query\.py setup`/);
  const claude = headlessDiscovery("claude", input);
  assert.ok(!claude.includes("--strict-mcp-config"));
  assert.equal(claude[claude.indexOf("--add-dir") + 1], input.project);
  assert.equal(claude[claude.indexOf("--allowedTools") + 1], "Read,Glob,Grep,Bash");
  assert.match(claude.at(-1), /query\.py" curate --project/);
});

test("uncompleted knowledge discovery has the first-session hand-off and exit code 2", () => {
  const { onFailure } = recoveryFor("knowledge-content", "knowledge-discovery-needed");
  assert.equal(onFailure.class, "hand-off");
  assert.equal(exitCodeOf(onFailure.class), 2);
  assert.match(onFailure.instruction, /Use the project-bootstrap skill to finish setup/);
});

test("each recovery has its approved class, exit and bounded fallback", () => {
  assert.deepEqual([...RECOVERY_CODES].sort(), Object.values(expected).flat().sort());
  Object.entries(expected).forEach(([kind, codes]) => codes.forEach((code) => {
    const entry = recoveryFor("settings", code);
    assert.equal(entry.class, kind, code);
    assert.equal(exitCodeOf(entry.class), { auto: 0, "hand-off": 2, "user-action": 2, stop: 1, preserve: 1 }[kind], code);
    assert.ok(entry.onFailure.instruction.length > 0, code);
    assert.ok(Number.isInteger(entry.attempts) && entry.attempts >= 0, code);
    assert.notEqual(entry.onFailure.class, "auto", code);
  }));
  assert.equal(recoveryFor("settings", "not-a-known-failure"), UNEXPECTED);
});

test("the table covers literal failures emitted directly by setup", async () => {
  const files = (await readdir(new URL("../src/", import.meta.url))).filter((file) => file.endsWith(".ts"));
  const sources = await Promise.all(files.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")));
  const emitted = sources.flatMap((source) => [...source.matchAll(/(?:fail|inputNeeded)\("([a-z][a-z-]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...new Set(emitted.filter((code) => !RECOVERY_CODES.includes(code)))], []);
});

test("the table covers failures propagated by project settings and tracker setup", async () => {
  const files = ["settings.ts", "node.ts", "linear.ts", "local.ts", "model.ts"];
  const sources = await Promise.all(files.map((file) => readFile(new URL(`../../project/src/${file}`, import.meta.url), "utf8")));
  const emitted = sources.flatMap((source) => [...source.matchAll(/fail\("([a-z][a-z-]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...new Set(emitted.filter((code) => !RECOVERY_CODES.includes(code)))].sort(), []);
});

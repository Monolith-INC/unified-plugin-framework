import assert from "node:assert/strict";
import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { cursorAdapter } from "@agent-plugins/adapter-cursor";
import { buildVendorBundle } from "@agent-plugins/workflows";
import { runInstallCommand } from "../dist/index.js";

const repo = resolve(import.meta.dirname, "../../..");
const plugin = join(repo, "fixtures", "plugins", "hello-world");

async function capture(operation) {
  const stdout = [];
  const stderr = [];
  const priorLog = console.log;
  const priorError = console.error;
  console.log = (value) => stdout.push(String(value));
  console.error = (value) => stderr.push(String(value));
  try {
    const code = await operation();
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally { console.log = priorLog; console.error = priorError; }
}

test("install --source builds each host payload from the source directory and installs it", async () => {
  const expected = {
    claude: ".claude-plugin/plugin.json",
    codex: ".codex-plugin/plugin.json",
    cursor: ".cursor-plugin/plugin.json",
  };
  for (const [vendor, manifest] of Object.entries(expected)) {
    const target = mkdtempSync(join(tmpdir(), `cli-${vendor}-`));
    const result = await capture(() => runInstallCommand(["--source", plugin, "--vendor", vendor, "--target", target]));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.vendor, vendor);
    assert.equal(output.target, target);
    assert.equal(output.changedPaths, 2);
    assert.equal(chmodSync(join(target, manifest), 0o644), undefined);
  }
});

test("install parser rejects missing, duplicate, unknown, and extra arguments with exit 2", async () => {
  const cases = [
    [],
    ["--source", plugin, "--vendor", "unknown", "--target", "/tmp"],
    ["--source", plugin, "--vendor", "claude", "--vendor", "codex"],
    ["--source", plugin, "--vendor", "claude", "--target", "/tmp", "extra"],
    ["--source", plugin, "--mystery", "x", "--target", "/tmp"],
    [plugin, "--vendor", "claude", "--target", "/tmp"],
  ];
  for (const argv of cases) {
    const result = await capture(() => runInstallCommand(argv));
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).outcome, "invalid-arguments");
  }
});

test("install help is the only non-installing zero-exit path", async () => {
  const result = await capture(() => runInstallCommand(["--help"]));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Usage: agent-plugin install/u);
  assert.equal(result.stderr, "");
});

test("CLI maps every transaction failure variant to the stable envelope and exit code", async () => {
  const loaded = buildVendorBundle(plugin, cursorAdapter);
  assert.equal(loaded.ok, true);
  const record = {
    schemaVersion: "1.0.0",
    plugin: "hello-world",
    version: "1.0.0",
    vendor: "cursor",
    adapterVersion: "1.0.0",
    sourceDigest: loaded.value.manifest.sourceDigest,
    payloadDigest: loaded.value.manifest.payloadDigest,
    installedFiles: [],
  };
  const diagnostic = { severity: "error", code: "fixture.failure", message: "Failure." };
  const variants = [
    [{ kind: "failed-before-mutation", diagnostics: [diagnostic] }, 3],
    [{ kind: "rolled-back", diagnostics: [diagnostic] }, 4],
    [{ kind: "rollback-failed", diagnostics: [diagnostic], recoveryJournal: "/tmp/recovery.jsonl" }, 5],
  ];
  for (const [installResult, exitCode] of variants) {
    const runtime = {
      resolve: () => ({ ok: true, value: { bundle: loaded.value, adapter: cursorAdapter } }),
      install: () => installResult,
    };
    const target = mkdtempSync(join(tmpdir(), "cli-failure-"));
    const result = await capture(() => runInstallCommand(["--source", plugin, "--vendor", "cursor", "--target", target], runtime));
    assert.equal(result.code, exitCode);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).outcome, installResult.kind);
  }

  const unexpected = await capture(() => runInstallCommand(["--source", plugin, "--vendor", "cursor", "--target", "/tmp"], {
    resolve() { throw new Error("secret details"); },
    install: () => ({ kind: "unchanged", changedPaths: 0, record }),
  }));
  assert.equal(unexpected.code, 70);
  assert.doesNotMatch(unexpected.stderr, /secret details/u);
});

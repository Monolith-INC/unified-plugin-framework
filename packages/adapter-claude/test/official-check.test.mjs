import assert from "node:assert/strict";
import test from "node:test";

import { PROBE_ARGS, officialFailures, unavailableMessage, validateArgs } from "../scripts/official-check.mjs";

const passed = (plugin) => ({ plugin, result: { ok: true } });
const OK = Object.freeze({ status: 0, stdout: "✔ Validation passed", stderr: "" });
const REJECTED = Object.freeze({ status: 1, stdout: "⚠ author: No author information provided", stderr: "" });

/** A fake CLI: answers by command line, so the test needs no process and records nothing. */
const cli = (answers) => (args) => answers.get(args.join(" ")) ?? OK;
const check = (overrides) =>
  officialFailures({
    operation: "verify",
    reports: [passed("alpha"), passed("beta")],
    payloadDir: (plugin) => `/payloads/${plugin}/payload`,
    cli: "claude",
    run: cli(new Map()),
    ...overrides,
  });
const codes = (failures) => failures.map(({ plugin, result }) => [plugin, result.diagnostics[0].code]);

test("payloads that pass Claude Code's validator add no reports", () => {
  assert.deepEqual(check({}), []);
});

test("only verify runs the validator, and only after every build passed", () => {
  const failing = cli(new Map([[validateArgs("/payloads/alpha/payload").join(" "), REJECTED]]));
  assert.deepEqual(check({ operation: "build", run: failing }), []);
  assert.deepEqual(check({ operation: "", run: failing }), []);
  assert.deepEqual(check({ run: failing, reports: [passed("alpha"), { plugin: "beta", result: { ok: false, diagnostics: [] } }] }), []);
});

test("a rejected payload becomes a failed report carrying the validator's output", () => {
  const failures = check({ run: cli(new Map([[validateArgs("/payloads/beta/payload").join(" "), REJECTED]])) });
  assert.deepEqual(codes(failures), [["beta", "claude.official.rejected"]]);
  assert.match(failures[0].result.diagnostics[0].message, /No author information/);
});

test("a validator that times out or is killed is a rejection that says why", () => {
  const killed = { status: null, signal: "SIGTERM", stdout: "", stderr: "", error: new Error("spawnSync claude ETIMEDOUT") };
  const failures = check({ run: cli(new Map([[validateArgs("/payloads/alpha/payload").join(" "), killed]])) });
  assert.deepEqual(codes(failures), [["alpha", "claude.official.rejected"]]);
  assert.match(failures[0].result.diagnostics[0].message, /ETIMEDOUT[\s\S]*stopped by SIGTERM/);
});

test("a CLI that cannot start gives one report with the recovery instruction, on every platform", () => {
  const missing = { status: null, stdout: "", stderr: "", error: Object.assign(new Error("spawnSync claude ENOENT"), { code: "ENOENT" }) };
  const notRecognized = { status: 1, stdout: "", stderr: "'claude' is not recognized as an internal or external command" };
  [missing, notRecognized].map((probe) => {
    const failures = check({ run: cli(new Map([[PROBE_ARGS.join(" "), probe]])) });
    assert.deepEqual(codes(failures), [["claude", "claude.official.unavailable"]]);
    assert.equal(failures[0].result.diagnostics[0].message, unavailableMessage("claude"));
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { allReady, bootstrapHosts, HOST_STEPS, recoveryEvents } from "../dist/tooling-bootstrap.js";

const pass = (value) => ({ ok: true, value });
const fail = (code) => ({ ok: false, error: { code, message: "fixture failure", recovery: "fixture recovery" } });
const ready = pass({ status: "ready", evidence: "fixture" });
const missing = pass({ status: "missing", recovery: "fixture" });
const plan = (steps) => ({ hosts: ["codex", "claude"], steps });
const record = (seen, inspect, configure) => (host) => ({
  inspect: (step) => async () => {
    seen.push([host, "inspect", step]);
    return inspect?.(host, step) ?? ready;
  },
  configure: (step) => async () => {
    seen.push([host, "configure", step]);
    return configure?.(host, step) ?? pass("configured");
  },
});

test("shared steps run once, selected host steps run per host, and setup is deferred", async () => {
  const seen = [];
  const progress = [];
  const task = bootstrapHosts(record(seen), true, plan(["settings", "cli", "tracker", ...HOST_STEPS]), (host, step) => progress.push([host, step]));
  assert.deepEqual(seen, []);
  const { value } = await task();
  assert.deepEqual(value.project.steps.map(({ step }) => step), ["settings", "cli", "tracker"]);
  assert.deepEqual(value.hosts.map(({ host, tooling }) => [host, tooling.steps.map(({ step }) => step)]),
    [["codex", HOST_STEPS], ["claude", HOST_STEPS]]);
  assert.equal(seen.filter(([, , step]) => step === "settings").length, 1);
  assert.deepEqual(progress, [[undefined, "settings"], [undefined, "cli"], [undefined, "tracker"],
    ...HOST_STEPS.map((step) => ["codex", step]), ...HOST_STEPS.map((step) => ["claude", step])]);
  assert.equal(seen.some(([, effect]) => effect === "configure"), false);
});

test("retry uses the table cap and a failed host leaves the second host running", async () => {
  const seen = [];
  const io = record(seen, (host) => host === "codex" ? missing : ready, () => fail("write-busy"));
  const { value } = await bootstrapHosts(io, true, plan(["skills"]))();
  assert.equal(seen.filter(([host, call]) => host === "codex" && call === "configure").length, 3);
  assert.deepEqual(value.events.map(({ action }) => action), ["retry", "retry", "none"]);
  assert.deepEqual(value.hosts.map(({ tooling }) => tooling.status), ["action-required", "ready"]);
});

test("a Preserve failure is never retried and later dependencies trigger verification", async () => {
  const seen = [];
  const io = record(seen, (host, step) => host === "codex" ? fail("modified-file")
    : step === "host-discovery" && !seen.some(([name, op]) => name === "claude" && op === "configure") ? missing : ready);
  const { value } = await bootstrapHosts(io, true, plan(["dependencies"]))();
  assert.deepEqual(seen, [
    ["codex", "inspect", "dependencies"],
    ["claude", "inspect", "dependencies"],
    ["claude", "inspect", "host-discovery"],
    ["claude", "configure", "host-discovery"],
    ["claude", "inspect", "host-discovery"],
  ]);
  assert.equal(value.hosts[1].tooling.status, "ready");
  assert.deepEqual(value.events.map(({ action }) => action), ["none"]);
});

test("restricted planning never runs host effects or recovery for omitted steps", async () => {
  const seen = [];
  const { value } = await bootstrapHosts(record(seen, () => missing), false, plan(["cli"]))();
  assert.deepEqual(seen, [["codex", "inspect", "cli"]]);
  assert.deepEqual(value.hosts.map(({ tooling }) => tooling.steps), [[], []]);
  assert.deepEqual(value.events, []);
});

test("all-ready combines readiness associatively and has a two-sided identity", () => {
  const statuses = ["ready", "action-required"];
  statuses.forEach((left) => {
    assert.equal(allReady.concat(left, allReady.empty), left);
    assert.equal(allReady.concat(allReady.empty, left), left);
    statuses.forEach((middle) => statuses.forEach((right) =>
      assert.equal(allReady.concat(allReady.concat(left, middle), right), allReady.concat(left, allReady.concat(middle, right)))));
  });
});

test("recovery events combine associatively while preserving their order", () => {
  const bronze = [{ host: "codex", step: "skills", code: "write-busy", action: "retry", attempt: 1 }];
  const silver = [{ ...bronze[0], attempt: 2 }];
  const gold = [{ ...bronze[0], host: "claude", attempt: 1 }];
  const { concat, empty } = recoveryEvents;
  assert.deepEqual(concat(empty, bronze), bronze);
  assert.deepEqual(concat(bronze, empty), bronze);
  assert.deepEqual(concat(concat(bronze, silver), gold), concat(bronze, concat(silver, gold)));
});

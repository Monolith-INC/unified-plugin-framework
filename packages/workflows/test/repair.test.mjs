import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  WORKFLOWS,
  checkQuestionWording,
  classifyReadinessFailure,
  concatAll,
  formatRepairSummary,
  planRepair,
  renderSkill,
  repairActions,
} from "../dist/index.js";

const framework = new URL("../../../", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("io.github.monolith-inc.upf/onboarded.lock.json", framework), "utf8"));

test("classifyReadinessFailure separates ready, first-attempt recoverable, and severe failures", () => {
  assert.deepEqual(classifyReadinessFailure({ status: "ready" }), { severity: "none" });

  const autoRecoverable = {
    status: "not-ready",
    step: "bound",
    reason: "No project knowledge store is configured.",
    recovery: {
      action: "run-skill",
      skill: { plugin: "monolithic-agent-knowledge-store", skill: "setup-project-knowledge" },
      goal: "Create the store.",
    },
  };
  assert.equal(classifyReadinessFailure(autoRecoverable, 0).severity, "recoverable");
  assert.deepEqual(classifyReadinessFailure(autoRecoverable, 1), {
    severity: "severe",
    kind: "recovery-failed",
    reason: "No project knowledge store is configured.",
  });

  const lockDrift = {
    status: "not-ready",
    step: "installed",
    reason: "Installed plugins do not match onboarded.lock.json.",
    recovery: { action: "ask-user", message: "Reinstall." },
  };
  assert.deepEqual(classifyReadinessFailure(lockDrift), {
    severity: "severe",
    kind: "manifest-or-lock-drift",
    reason: lockDrift.reason,
  });

  const missingPlugin = {
    status: "not-ready",
    step: "installed",
    reason: "No installed skills were found for superpowers.",
    recovery: { action: "ask-user", message: "Install superpowers." },
  };
  assert.equal(classifyReadinessFailure(missingPlugin).kind, "missing-or-incompatible-plugin");
});

test("planRepair proposes safe-auto diagnostics + consent-gated clean fix for fixable severe failures", () => {
  const fixableKinds = [
    "manifest-or-lock-drift",
    "missing-or-incompatible-plugin",
    "recovery-failed",
    "corrupted-project-state",
  ];
  fixableKinds.map((failureKind) => {
    const plan = planRepair({
      workflow: "discovery",
      operation: "discover-thorough",
      failureKind,
      summary: "The installed plugin version does not match the expected configuration.",
    });
    assert.equal(plan.severity, "severe");
    assert.equal(plan.canProposeFix, true);
    assert.equal(plan.actions[0].kind, "safe-auto");
    const proposal = plan.actions.find((action) => action.kind === "propose-with-consent");
    assert.ok(proposal, `${failureKind} proposes a consent-gated fix`);
    assert.equal(proposal.confirmation.safeDefault, "decline");
    assert.deepEqual(checkQuestionWording(proposal.confirmation), []);

    const rendered = formatRepairSummary(plan);
    assert.match(rendered, /discover-thorough hit a severe problem/);
    assert.match(rendered, /two-button confirmation/);
    assert.match(rendered, /resume `discover-thorough` from where it stopped/);
    return failureKind;
  });
});

test("planRepair escalates to manual handoff with exact resume hint when external or retries exhausted (Scenario 2)", () => {
  const external = planRepair({
    workflow: "project-tracking",
    operation: "track-breakdown",
    failureKind: "unrecoverable-external",
    summary: "Tracker authentication token is expired.",
  });
  assert.equal(external.canProposeFix, false);
  assert.ok(external.actions.some((action) => action.kind === "manual-handoff"));
  const externalSummary = formatRepairSummary(external);
  assert.match(externalSummary, /cannot be fixed automatically/);
  assert.match(externalSummary, /Next step for you/);
  assert.match(externalSummary, /resume `track-breakdown` from where it stopped/);

  const exhausted = planRepair({
    workflow: "code-review",
    operation: "review-story",
    failureKind: "recovery-failed",
    summary: "Knowledge store remains empty after setup.",
    triedFixes: ["setup-project-knowledge"],
  });
  assert.equal(exhausted.canProposeFix, false);
  const handoff = exhausted.actions.find((action) => action.kind === "manual-handoff");
  assert.ok(handoff);
  assert.match(handoff.instruction, /setup-project-knowledge/);
  assert.match(handoff.resumeHint, /resume `review-story` from where it stopped/);
});

test("repairActions satisfies the monoid laws (left identity, right identity, associativity)", () => {
  const a = Object.freeze([{ kind: "safe-auto", id: "a", description: "check a" }]);
  const b = Object.freeze([{ kind: "safe-auto", id: "b", description: "check b" }]);
  const c = Object.freeze([{ kind: "manual-handoff", id: "c", instruction: "do c", resumeHint: "resume" }]);

  assert.deepEqual(repairActions.concat(repairActions.empty, a), a);
  assert.deepEqual(repairActions.concat(a, repairActions.empty), a);
  assert.deepEqual(
    repairActions.concat(repairActions.concat(a, b), c),
    repairActions.concat(a, repairActions.concat(b, c)),
  );
  assert.deepEqual(concatAll(repairActions)([]), repairActions.empty);
  assert.deepEqual(concatAll(repairActions)([a, b, c]), [...a, ...b, ...c]);
});

test("every assembled workflow skill hands severe failures to repair-workflow and repair-workflow skill is complete", () => {
  const assembled = Object.values(WORKFLOWS).flatMap((adapter) =>
    Object.keys(adapter.fulfil).map((operation) => ({
      adapter,
      operation,
      path: new URL(`skills/${operation}/SKILL.md`, framework),
    })),
  );
  assert.equal(assembled.length, 25);
  assembled.map(({ adapter, operation, path }) => {
    const result = renderSkill(readFileSync(path, "utf8"), adapter, operation, lock);
    assert.equal(result.ok, true, `${operation}: ${result.message}`);
    assert.match(result.text, /hand over to `repair-workflow`/);
    return operation;
  });

  const repairSkill = readFileSync(new URL("skills/repair-workflow/SKILL.md", framework), "utf8");
  assert.match(repairSkill, /agent-plugin adapter-check/);
  assert.match(repairSkill, /Safe read-only boundary/);
  assert.match(repairSkill, /Scenario 1: Concrete fix available/);
  assert.match(repairSkill, /Scenario 2: Problem cannot be fixed automatically/);
  assert.match(repairSkill, /Do not apply/);
  assert.match(repairSkill, /resume the original workflow operation from where it stopped/);
});

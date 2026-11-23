import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SHARED_INTERACTION_SECTION,
  WORKFLOWS,
  brainstormingDiscoveryAdapter,
  checkAdapterReadiness,
  checkQuestionWording,
  concatAll,
  groupOptions,
  renderNativeQuestionGuidance,
  renderNumberedFallback,
  renderSkill,
  reviewToolkitAdapter,
  wordingFindings,
} from "../dist/index.js";

const framework = new URL("../../../", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("io.github.monolith-inc.upf/onboarded.lock.json", framework), "utf8"));

const singleQuestion = Object.freeze({
  kind: "single",
  explanation: "Choose where this project tracks its work items.",
  options: Object.freeze([
    { label: "Local files", description: "Keep work items as markdown files in this repository." },
    { label: "Linear", description: "Sync work items with your Linear team.", recommended: true },
  ]),
  allowOther: true,
});

const severalQuestion = Object.freeze({
  kind: "several",
  explanation: "Select any optional discovery methods you want to include.",
  options: Object.freeze(
    brainstormingDiscoveryAdapter.catalog.map((ref) => ({
      label: ref.skill,
      description: ref.use,
      group: ref.group,
    })),
  ),
  allowOther: true,
});

const confirmQuestion = Object.freeze({
  kind: "confirm",
  explanation: "Apply these setup changes to the project?",
  acceptLabel: "Apply setup plan",
  declineLabel: "Do not apply",
  safeDefault: "decline",
});

test("SHARED_INTERACTION_SECTION names concrete host question tools and forbids unnumbered bullet menus", () => {
  for (const tool of ["request_user_input", "AskUserQuestion", "AskQuestion", "ask_question"]) {
    assert.ok(SHARED_INTERACTION_SECTION.includes(tool), `missing host tool ${tool}`);
  }
  assert.match(SHARED_INTERACTION_SECTION, /never unnumbered `-` bullets/i);
  assert.match(SHARED_INTERACTION_SECTION, /Other \(type your own answer\)/);
});

test("question guidance yields needs-input when there is no reply channel", () => {
  assert.match(SHARED_INTERACTION_SECTION, /no reply channel/i);
  assert.match(SHARED_INTERACTION_SECTION, /needs-input/i);
  assert.match(SHARED_INTERACTION_SECTION, /without (reading|waiting on) stdin/i);
  assert.match(SHARED_INTERACTION_SECTION, /optional-only prompt cannot carry a required decision/i);
  assert.match(SHARED_INTERACTION_SECTION, /stable option keys/i);
  assert.match(SHARED_INTERACTION_SECTION, /preserve custom text literally/i);
  assert.match(SHARED_INTERACTION_SECTION, /dismissal or ambiguous response is not consent/i);
});

test("single-choice renderers place recommended first, include Other, and provide numbered fallback", () => {
  const native = renderNativeQuestionGuidance(singleQuestion);
  assert.match(native, /native single-choice prompt/);
  assert.ok(native.indexOf("Linear (Recommended)") < native.indexOf("Local files"));
  assert.match(native, /- Other \(type your own answer\)/);

  const fallback = renderNumberedFallback(singleQuestion);
  assert.match(fallback, /1\. Linear \(Recommended\)/);
  assert.match(fallback, /2\. Local files/);
  assert.match(fallback, /3\. Other \(type your own answer\)/);
  assert.match(fallback, /Reply with a number \(1–3\)/);
});

test("groupOptions splits all 11 BMad catalog skills into groups of at most 4 without dropping any", () => {
  const groups = groupOptions(severalQuestion.options);
  assert.equal(groups.length, 4);
  assert.ok(groups.every((group) => group.options.length <= 4));
  const flattened = groups.flatMap((group) => group.options.map(({ label }) => label));
  assert.equal(flattened.length, 11);
  assert.deepEqual(
    flattened.toSorted(),
    brainstormingDiscoveryAdapter.catalog.map(({ skill }) => skill).toSorted(),
  );
});

test("groupOptions chunks any single group that exceeds maxPerGroup", () => {
  const many = Array.from({ length: 6 }, (_, index) => ({ label: `Option ${index + 1}`, group: "Large" }));
  const groups = groupOptions(many, 4);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, "Large (1/2)");
  assert.equal(groups[0].options.length, 4);
  assert.equal(groups[1].name, "Large (2/2)");
  assert.equal(groups[1].options.length, 2);
});

test("several-choice renderers group long lists for native UI and number every row in fallback", () => {
  const native = renderNativeQuestionGuidance(severalQuestion);
  assert.match(native, /native multi-select controls/);
  assert.match(native, /### Shape & Ideate/);
  assert.match(native, /### Pressure-Test/);
  assert.match(native, /### Research & Review/);
  assert.match(native, /### Document & Spec/);

  const fallback = renderNumberedFallback(severalQuestion);
  assert.match(fallback, /11\./);
  assert.match(fallback, /12\. Other \(type your own answer\)/);
  assert.match(fallback, /comma-separated numbers/);
});

test("confirm renderers default to decline and never treat closing or empty reply as yes", () => {
  const native = renderNativeQuestionGuidance(confirmQuestion);
  assert.match(native, /two-button confirmation/);
  assert.match(native, /Do not apply \(safe default; closing or an empty reply is not consent\)/);

  const fallback = renderNumberedFallback(confirmQuestion);
  assert.match(fallback, /1\. Apply setup plan/);
  assert.match(fallback, /2\. Do not apply \(default\)/);
  assert.match(fallback, /An empty reply or closing the prompt is not an answer/);
});

test("wordingFindings satisfies the monoid laws (left identity, right identity, associativity)", () => {
  const a = Object.freeze([{ code: "empty-explanation", field: "explanation", message: "a" }]);
  const b = Object.freeze([{ code: "doc-or-ticket-reference", field: "options[0].label", message: "b" }]);
  const c = Object.freeze([{ code: "unexplained-acronym", field: "options[1].description", message: "c" }]);

  assert.deepEqual(wordingFindings.concat(wordingFindings.empty, a), a);
  assert.deepEqual(wordingFindings.concat(a, wordingFindings.empty), a);
  assert.deepEqual(
    wordingFindings.concat(wordingFindings.concat(a, b), c),
    wordingFindings.concat(a, wordingFindings.concat(b, c)),
  );
  assert.deepEqual(concatAll(wordingFindings)([]), wordingFindings.empty);
  assert.deepEqual(concatAll(wordingFindings)([a, b, c]), [...a, ...b, ...c]);
});

test("checkQuestionWording passes clean plain-language questions and flags defects", () => {
  assert.deepEqual(checkQuestionWording(singleQuestion), []);
  assert.deepEqual(checkQuestionWording(confirmQuestion), []);

  const explainedAcronym = {
    ...singleQuestion,
    explanation: "Choose whether to write a Product Requirements Document (PRD) now.",
    options: [
      { label: "Write PRD", description: "Create the PRD right now.", recommended: true },
      { label: "Skip for now", description: "Keep only a short summary." },
    ],
  };
  assert.deepEqual(checkQuestionWording(explainedAcronym), []);

  const defective = {
    kind: "single",
    explanation: "See ENG-42 and packages/cli/src/index.ts before picking a PRD mode.",
    options: [{ label: "ADR format", description: "Check plugin.json for details." }],
    allowOther: false,
  };
  const findings = checkQuestionWording(defective);
  const codes = new Set(findings.map(({ code }) => code));
  assert.ok(codes.has("doc-or-ticket-reference"));
  assert.ok(codes.has("unexplained-acronym"));
  assert.ok(codes.has("missing-other"));

  const blankConfirm = {
    kind: "confirm",
    explanation: "   ",
    acceptLabel: "Yes",
    declineLabel: "No",
    safeDefault: "accept",
  };
  const confirmCodes = new Set(checkQuestionWording(blankConfirm).map(({ code }) => code));
  assert.ok(confirmCodes.has("empty-explanation"));
  assert.ok(confirmCodes.has("unsafe-confirm-default"));
});

test("ask-user version recoveries carry a clean structured single-choice Question", () => {
  const result = checkAdapterReadiness({
    adapter: reviewToolkitAdapter,
    onboarded: [{ name: "monolithic-code-review-toolkit", version: "^0.6.0", source: "github:x/y", adapter: "code-review" }],
    lock,
    installed: new Map([["monolithic-code-review-toolkit", { version: "0.7.0", checksum: "abc", skills: ["review-task", "review-story-preflight", "review-story-postflight", "review-feature", "review-setup"] }]]),
    projectStore: "/repo/Project_Knowledge",
    pluginStores: new Map(),
  });
  assert.equal(result.status, "not-ready");
  assert.equal(result.recovery.action, "ask-user");
  assert.equal(result.recovery.question?.kind, "single");
  assert.equal(result.recovery.question?.allowOther, true);
  assert.deepEqual(checkQuestionWording(result.recovery.question), []);
});

test("every template-assembled skill and pass-through interactive skill carries interaction presentation rules", () => {
  const assembledOperations = Object.values(WORKFLOWS).flatMap((adapter) =>
    Object.keys(adapter.fulfil).map((operation) => ({
      adapter,
      operation,
      path: new URL(`skills/${operation}/SKILL.md`, framework),
    })),
  );
  assert.equal(assembledOperations.length, 25);
  assembledOperations.map(({ adapter, operation, path }) => {
    const result = renderSkill(readFileSync(path, "utf8"), adapter, operation, lock);
    assert.equal(result.ok, true, `${operation}: ${result.message}`);
    assert.ok(result.text.includes(SHARED_INTERACTION_SECTION), `${operation} includes SHARED_INTERACTION_SECTION`);
    assert.match(result.text, /agent-plugin question prepare/);
    assert.match(result.text, /agent-plugin question answer/);
    return operation;
  });

  const bootstrap = readFileSync(new URL("skills/project-bootstrap/SKILL.md", framework), "utf8");
  assert.match(bootstrap, /## Presenting setup questions to the user/);
  assert.match(bootstrap, /Other \(type your own answer\)/);
  assert.match(bootstrap, /Closing the prompt or sending an empty reply never counts as yes/);
  assert.match(bootstrap, /only when a reply channel is available/i);
  assert.match(bootstrap, /needs-input/i);
  assert.match(bootstrap, /agent-plugin question answer/);

  const repair = readFileSync(new URL("skills/repair-workflow/SKILL.md", framework), "utf8");
  assert.match(repair, /## Presenting questions to the user/);
  assert.match(repair, /Other \(type your own answer\)/);
  assert.match(repair, /only when a reply channel is available/i);
  assert.match(repair, /needs-input/i);
  assert.match(repair, /agent-plugin question answer/);
});

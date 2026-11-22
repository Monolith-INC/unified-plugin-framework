import type { Monoid, Readiness } from "./adapter.js";
import { chooseQuestionChannel, prepareQuestion, type PreparedQuestion, type QuestionCapabilities } from "./question-channel.js";
import {
  concatAll,
  renderNativeQuestionGuidance,
  renderNumberedFallback,
  type ConfirmQuestion,
} from "./questions.js";

/** Whether a failure can recover automatically or must hand over to the repair agent. */
export type FailureSeverity = "recoverable" | "severe";

/** Closed set of severe failure categories handled by the repair agent. */
export type SevereFailureKind =
  | "manifest-or-lock-drift"
  | "missing-or-incompatible-plugin"
  | "recovery-failed"
  | "corrupted-project-state"
  | "unrecoverable-external";

/** Classification result for a readiness check outcome. */
export type FailureClassification =
  | { readonly severity: "none" }
  | { readonly severity: "recoverable"; readonly reason: string }
  | { readonly severity: "severe"; readonly kind: SevereFailureKind; readonly reason: string };

/** Closed union of actions the repair agent may take or propose. */
export type RepairAction =
  | { readonly kind: "safe-auto"; readonly id: string; readonly description: string; readonly command?: string }
  | {
      readonly kind: "propose-with-consent";
      readonly id: string;
      readonly description: string;
      readonly command?: string;
      readonly confirmation: ConfirmQuestion;
    }
  | {
      readonly kind: "manual-handoff";
      readonly id: string;
      readonly instruction: string;
      readonly resumeHint: string;
    };

/** Context handed from a failing workflow to the repair agent. */
export interface RepairContext {
  readonly workflow: string;
  readonly operation: string;
  readonly failureKind: SevereFailureKind;
  readonly summary: string;
  readonly triedFixes?: readonly string[];
}

/** Pure, deterministic repair plan produced for a severe workflow failure. */
export interface RepairPlan {
  readonly severity: "severe";
  readonly context: RepairContext;
  readonly shortMessage: string;
  readonly actions: readonly RepairAction[];
  readonly canProposeFix: boolean;
  readonly resumeInstruction: string;
}

/** Lawful monoid combining repair actions in execution order; the empty list is the identity. */
export const repairActions: Monoid<readonly RepairAction[]> = Object.freeze({
  empty: Object.freeze([] as readonly RepairAction[]),
  concat: (x: readonly RepairAction[], y: readonly RepairAction[]): readonly RepairAction[] =>
    Object.freeze([...x, ...y]),
});

const classifyNotReady = (
  step: "declared" | "installed" | "bound",
  reason: string,
  action: "run-skill" | "ask-user",
  priorAttempts: number,
): FailureClassification => {
  switch (action) {
    case "run-skill":
      return priorAttempts === 0
        ? Object.freeze({ severity: "recoverable", reason })
        : Object.freeze({ severity: "severe", kind: "recovery-failed", reason });
    case "ask-user":
      switch (step) {
        case "declared":
          return Object.freeze({ severity: "severe", kind: "manifest-or-lock-drift", reason });
        case "installed":
          return reason.includes("lock") || reason.includes("release must not change")
            ? Object.freeze({ severity: "severe", kind: "manifest-or-lock-drift", reason })
            : Object.freeze({ severity: "severe", kind: "missing-or-incompatible-plugin", reason });
        case "bound":
          return reason.includes("Published content differs")
            ? Object.freeze({ severity: "severe", kind: "manifest-or-lock-drift", reason })
            : Object.freeze({ severity: "severe", kind: "missing-or-incompatible-plugin", reason });
      }
  }
};

/** Classifies a readiness outcome into none, recoverable, or severe. Pure. */
export const classifyReadinessFailure = (readiness: Readiness, priorAttempts: number = 0): FailureClassification => {
  switch (readiness.status) {
    case "ready":
      return Object.freeze({ severity: "none" });
    case "not-ready":
      return classifyNotReady(readiness.step, readiness.reason, readiness.recovery.action, priorAttempts);
  }
};

const confirmFix = (explanation: string): ConfirmQuestion =>
  Object.freeze({
    kind: "confirm",
    explanation,
    acceptLabel: "Apply proposed fix",
    declineLabel: "Do not apply",
    safeDefault: "decline",
  });

const safeDiagnostic = (workflow: string): readonly RepairAction[] =>
  Object.freeze([
    Object.freeze({
      kind: "safe-auto" as const,
      id: "inspect-readiness",
      description: `Inspect ${workflow} readiness and project settings in read-only mode.`,
      command: `agent-plugin adapter-check ${workflow} --project <project-directory>`,
    }),
  ]);

const resumeFor = (operation: string): string =>
  `Once resolved, resume \`${operation}\` from where it stopped; existing drafts and saved choices are preserved.`;

const manualHandoff = (id: string, instruction: string, operation: string): readonly RepairAction[] =>
  Object.freeze([
    Object.freeze({
      kind: "manual-handoff" as const,
      id,
      instruction,
      resumeHint: resumeFor(operation),
    }),
  ]);

const buildProposedActions = (context: RepairContext): readonly RepairAction[] => {
  const exhausted = (context.triedFixes?.length ?? 0) > 0;
  if (exhausted) {
    return manualHandoff(
      "escalate-after-retries",
      `Tried fixes did not clear the problem (${context.triedFixes?.join("; ") ?? ""}). Resolve the underlying blocker directly in this workspace or host.`,
      context.operation,
    );
  }
  switch (context.failureKind) {
    case "manifest-or-lock-drift":
      return Object.freeze([
        Object.freeze({
          kind: "propose-with-consent" as const,
          id: "reinstall-pinned-plugins",
          description: `Reinstall the pinned plugins for ${context.workflow} so the installed files match the framework lock.`,
          command: `agent-plugin project bootstrap --input <project-directory>/.upf-tools/setup-plan.json --project <project-directory> --apply`,
          confirmation: confirmFix(`Reinstall the pinned plugins for ${context.workflow} to clear the version or lock mismatch?`),
        }),
      ]);
    case "missing-or-incompatible-plugin":
      return Object.freeze([
        Object.freeze({
          kind: "propose-with-consent" as const,
          id: "install-missing-plugins",
          description: `Install and enable the missing or incompatible plugin dependency for ${context.workflow}.`,
          command: `agent-plugin project bootstrap --input <project-directory>/.upf-tools/setup-plan.json --project <project-directory> --apply`,
          confirmation: confirmFix(`Install and enable the required plugin for ${context.workflow} now?`),
        }),
      ]);
    case "recovery-failed":
      return Object.freeze([
        Object.freeze({
          kind: "propose-with-consent" as const,
          id: "repair-failed-setup",
          description: `Run project setup recovery to repair the failed automatic setup step for ${context.workflow}.`,
          command: `agent-plugin project describe --project <project-directory>`,
          confirmation: confirmFix(`Run guided project setup recovery for ${context.workflow} now?`),
        }),
      ]);
    case "corrupted-project-state":
      return Object.freeze([
        Object.freeze({
          kind: "propose-with-consent" as const,
          id: "rebuild-project-state",
          description: `Repair the project settings or shared knowledge store configuration while preserving existing user files.`,
          command: `agent-plugin project bootstrap --input <project-directory>/.upf-tools/setup-plan.json --project <project-directory> --apply`,
          confirmation: confirmFix("Repair the project configuration while keeping existing files intact?"),
        }),
      ]);
    case "unrecoverable-external":
      return manualHandoff(
        "external-action-required",
        `This failure depends on an external requirement (${context.summary}). Complete the required sign-in, credential, network, or file-conflict step manually.`,
        context.operation,
      );
  }
};

/** Builds a bounded, consent-gated repair plan for a severe workflow failure. Pure. */
export const planRepair = (context: RepairContext): RepairPlan => {
  const actions = concatAll(repairActions)([safeDiagnostic(context.workflow), buildProposedActions(context)]);
  const canProposeFix = actions.some((action) => action.kind === "propose-with-consent");
  const resumeInstruction = resumeFor(context.operation);
  const shortMessage = canProposeFix
    ? `${context.operation} hit a severe problem: ${context.summary} A concrete fix is ready for your approval.`
    : `${context.operation} hit a problem that cannot be fixed automatically: ${context.summary}`;
  return Object.freeze({
    severity: "severe",
    context,
    shortMessage,
    actions,
    canProposeFix,
    resumeInstruction,
  });
};

/** Prepare the proposed repair as a required consent decision without executing its effect. */
export const prepareRepairDecision = (plan: RepairPlan, instance: string, capabilities: QuestionCapabilities): PreparedQuestion => {
  const proposal = plan.actions.find((action) => action.kind === "propose-with-consent");
  return proposal === undefined ? { kind: "invalid", instance } : prepareQuestion({
    instance, question: proposal.confirmation, displayedKeys: ["accept", "decline"], acceptKey: "accept", answered: false,
    channel: chooseQuestionChannel(proposal.confirmation, capabilities, true),
  }, capabilities, true);
};

const renderAction = (action: RepairAction): string => {
  switch (action.kind) {
    case "safe-auto":
      return `- **Read-only check (${action.id}):** ${action.description}${action.command === undefined ? "" : ` (\`${action.command}\`)`}`;
    case "propose-with-consent":
      return [
        `- **Proposed fix (${action.id}):** ${action.description}${action.command === undefined ? "" : ` (\`${action.command}\`)`}`,
        "",
        renderNativeQuestionGuidance(action.confirmation),
        "",
        "Fallback when native controls are unavailable:",
        renderNumberedFallback(action.confirmation),
      ].join("\n");
    case "manual-handoff":
      return `- **Next step for you (${action.id}):** ${action.instruction}`;
  }
};

/** Formats a repair plan into one concise message with the concrete fix or manual next step and resume hint. Pure. */
export const formatRepairSummary = (plan: RepairPlan): string =>
  [plan.shortMessage, "", ...plan.actions.map(renderAction), "", plan.resumeInstruction].join("\n");

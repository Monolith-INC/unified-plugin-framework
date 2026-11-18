import { bootstrapTooling, ok, TOOLING_STEPS, type Failure, type Result, type Task, type ToolingIO, type ToolingOutcome, type ToolingReport, type ToolingStep } from "@agent-plugins/project";
import type { AcceptedPlan } from "./tooling-input.js";
import type { HostName } from "./host-names.js";
import { recoveryFor, type RecoveryAction, type TaskKind } from "./tooling-recovery.js";

export const HOST_STEPS: readonly ToolingStep[] = ["skills", "dependencies", "knowledge-server", "host-discovery"];
type Readiness = ToolingReport["status"];
export const allReady = {
  empty: "ready" as Readiness,
  concat: (left: Readiness, right: Readiness): Readiness => left === "ready" && right === "ready" ? "ready" : "action-required",
};
export const summarizeSteps = (steps: readonly ToolingOutcome[]): ToolingReport => ({
  status: steps.reduce((status, step) => allReady.concat(status, step.status), allReady.empty),
  steps,
});

export interface HostRun {
  readonly host: HostName;
  readonly tooling: ToolingReport;
}
export interface BootstrapEvent {
  readonly host?: HostName;
  readonly step: ToolingStep;
  readonly code: string;
  readonly action: RecoveryAction["kind"];
  readonly attempt: number;
}
export const recoveryEvents = {
  empty: [] as readonly BootstrapEvent[],
  concat: (left: readonly BootstrapEvent[], right: readonly BootstrapEvent[]): readonly BootstrapEvent[] => [...left, ...right],
};
export interface HostSetup {
  readonly project: ToolingReport;
  readonly hosts: readonly HostRun[];
  readonly events: readonly BootstrapEvent[];
}
type ProjectPhase = { readonly report: ToolingReport; readonly events: readonly BootstrapEvent[] };
type StepResult = { readonly step: ToolingOutcome; readonly events: readonly BootstrapEvent[] };

const retryable = (action: RecoveryAction, step: ToolingStep): boolean =>
  action.kind === "retry" || action.kind === "take-over-stale-lock" || action.kind === "clean-and-redo"
    || (action.kind === "backup-and-replace-owned" && step === "cli");

type RetryState = { readonly code: string; readonly remaining: number; readonly attempt: number };
const recoveryStep = (io: ToolingIO, apply: boolean, step: ToolingStep, host?: HostName, state?: RetryState): Task<StepResult> => async () => {
  const run = await bootstrapTooling(io, apply, [step])();
  const observed = run.ok ? run.value.steps[0] : undefined;
  const outcome: ToolingOutcome = observed ?? { step, status: "action-required",
    failure: run.ok ? { code: "tooling-missing", message: "No observation was recorded.", recovery: "Repeat setup for this step." } : run.error };
  return outcome.status === "ready" || !apply ? ok({ step: outcome, events: recoveryEvents.empty })
    : recoverOutcome(io, outcome, host, state);
};

const recoverOutcome = async (io: ToolingIO, outcome: Extract<ToolingOutcome, { status: "action-required" }>,
  host?: HostName, state?: RetryState): Promise<Result<StepResult>> => {
  const { step, failure } = outcome;
  const policy = recoveryFor(step, failure.code);
  const remaining = state === undefined ? policy.attempts : state.code === failure.code ? state.remaining : 0;
  const attempt = (state?.attempt ?? 0) + 1;
  const action = remaining > 0 && retryable(policy.action, step) ? policy.action.kind : "none";
  const event: BootstrapEvent = { ...(host === undefined ? {} : { host }), step, code: failure.code, action, attempt };
  const next: StepResult = { step: { ...outcome, failure: withRecovery(failure, policy.onFailure.instruction) }, events: [event] };
  const retried = action === "none" ? ok(next) : await recoveryStep(io, true, step, host, { code: failure.code, remaining: remaining - 1, attempt })();
  return retried.ok && action !== "none" ? ok({ ...retried.value, events: recoveryEvents.concat([event], retried.value.events) }) : retried;
};

const withRecovery = (failure: Failure, instruction: string): Failure =>
  failure.code === "tooling-missing" ? failure : { ...failure, recovery: instruction };

const runPhase = (io: ToolingIO, apply: boolean, steps: readonly ToolingStep[], host?: HostName,
  progress: (host: HostName | undefined, step: ToolingStep) => void = () => undefined): Promise<ProjectPhase> =>
  steps.reduce<Promise<ProjectPhase>>((pending, step) => pending.then(async (phase) => {
    progress(host, step);
    const result = await recoveryStep(io, apply, step, host)();
    return result.ok
      ? { report: summarizeSteps([...phase.report.steps, result.value.step]), events: recoveryEvents.concat(phase.events, result.value.events) }
      : { ...phase, report: summarizeSteps([...phase.report.steps, { step, status: "action-required", failure: result.error }]) };
  }), Promise.resolve({ report: summarizeSteps([]), events: recoveryEvents.empty }));

const selectedSteps = (plan: AcceptedPlan, host: HostName): readonly ToolingStep[] =>
  HOST_STEPS.filter((step) => plan.steps.includes(step) || (host !== plan.hosts[0] && step === "host-discovery" && plan.steps.includes("dependencies")));

/** Describe one install without effects. Running the task sequences project work and each selected host. */
export const bootstrapHosts = (ioFor: (host: HostName) => ToolingIO, apply: boolean, plan: AcceptedPlan,
  progress?: (host: HostName | undefined, step: ToolingStep) => void): Task<HostSetup> => async () => {
  const project = await runPhase(ioFor(plan.hosts[0]), apply, TOOLING_STEPS.filter((step) => plan.steps.includes(step) && !HOST_STEPS.includes(step)), undefined, progress);
  return ok(await plan.hosts.reduce<Promise<HostSetup>>((pending, host) => pending.then(async (setup) => {
    const phase = await runPhase(ioFor(host), apply, selectedSteps(plan, host), host, progress);
    return { ...setup, hosts: [...setup.hosts, { host, tooling: phase.report }], events: recoveryEvents.concat(setup.events, phase.events) };
  }), Promise.resolve({ project: project.report, hosts: [], events: project.events })));
};

export const pendingTasks = (report: ToolingReport): readonly TaskKind[] =>
  [...new Set(report.steps.flatMap((step): readonly TaskKind[] => {
    if (step.status === "ready") return [];
    const { action } = recoveryFor(step.step, step.failure.code);
    switch (action.kind) {
      case "hand-off": return [action.task];
      case "acquire-knowledge": return ["knowledge-discovery"];
      default: return step.failure.code === "host-sign-in-needed" ? ["host-sign-in"] : [];
    }
  }))];

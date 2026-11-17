import { fail, ok, type Failure, type Result, type Task } from "./model.js";

/** Setup runs only on explicit bootstrap or a missing capability, never on every skill invocation. */
export const TOOLING_STEPS = Object.freeze([
  "settings", "cli", "skills", "dependencies", "knowledge-runtime", "knowledge-settings",
  "knowledge-content", "knowledge-server", "review", "host-discovery", "tracker",
] as const);
export type ToolingStep = (typeof TOOLING_STEPS)[number];
export type ToolingObservation =
  | { readonly status: "ready"; readonly evidence: string }
  | { readonly status: "missing"; readonly recovery: string };
export type ToolingOutcome =
  | { readonly step: ToolingStep; readonly status: "ready"; readonly evidence: string }
  | { readonly step: ToolingStep; readonly status: "action-required"; readonly failure: Failure };
export interface ToolingIO {
  readonly inspect: (step: ToolingStep) => Task<ToolingObservation>;
  readonly configure: (step: ToolingStep) => Task<string>;
}
export interface ToolingReport {
  readonly status: "ready" | "action-required";
  readonly steps: readonly ToolingOutcome[];
}

const ready = (step: ToolingStep, evidence: string): ToolingOutcome => ({ step, status: "ready", evidence });
const required = (step: ToolingStep, failure: Failure): ToolingOutcome => ({ step, status: "action-required", failure });
const observed = (step: ToolingStep, result: Result<ToolingObservation>): ToolingOutcome => {
  switch (result.ok) {
    case false: return required(step, result.error);
    case true: return result.value.status === "ready" ? ready(step, result.value.evidence)
      : required(step, { code: "tooling-missing", message: `${step} is not ready.`, recovery: result.value.recovery });
  }
};
const verify = (io: ToolingIO, step: ToolingStep, configured: Result<string>): Task<ToolingOutcome> => () => {
  switch (configured.ok) {
    case false: return Promise.resolve(ok(required(step, configured.error)));
    case true: return io.inspect(step)().then((result) => ok(observed(step, result)));
  }
};
const applyMissing = (io: ToolingIO, step: ToolingStep, observation: Result<ToolingObservation>, apply: boolean): Task<ToolingOutcome> => () => {
  switch (observation.ok) {
    case false: return Promise.resolve(ok(required(step, observation.error)));
    case true: return observation.value.status === "ready" || !apply
      ? Promise.resolve(ok(observed(step, observation)))
      : io.configure(step)().then((configured) => verify(io, step, configured)());
  }
};
const report = (steps: readonly ToolingOutcome[]): ToolingReport => ({
  status: steps.every((step) => step.status === "ready") ? "ready" : "action-required", steps,
});
const runSteps = (io: ToolingIO, steps: readonly ToolingStep[], apply: boolean, done: readonly ToolingOutcome[]): Task<ToolingReport> => () => {
  const [step, ...remaining] = steps;
  return step === undefined ? Promise.resolve(ok(report(done)))
    : io.inspect(step)().then((observation) => applyMissing(io, step, observation, apply)())
      .then((outcome) => outcome.ok ? runSteps(io, remaining, apply, [...done, outcome.value])() : outcome);
};

/** One execution path for plans, setup and re-entry; successful capabilities are observed rather than reinstalled. */
export const bootstrapTooling = (io: ToolingIO, apply: boolean, requiredSteps: readonly ToolingStep[] = TOOLING_STEPS): Task<ToolingReport> =>
  runSteps(io, TOOLING_STEPS.filter((step) => requiredSteps.includes(step)), apply, []);

/** Resume is held until all required capabilities have concrete evidence. Failed writes are not retried here. */
export const resumeTooling = <A>(report: ToolingReport, resume: Task<A>): Task<{ readonly tooling: ToolingReport; readonly resumed: A }> => () =>
  report.status === "ready" ? resume().then((result) => result.ok ? ok({ tooling: report, resumed: result.value }) : result)
    : Promise.resolve(fail("tooling-incomplete", "The original request is preserved while setup needs attention.", "Complete the reported capability recoveries, then resume the saved request."));

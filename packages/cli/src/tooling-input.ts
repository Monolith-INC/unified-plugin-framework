import { fail, flatMap, object, ok, text, TOOLING_STEPS, type JsonObject, type Result, type ToolingStep } from "@agent-plugins/project";
import { WORKFLOWS } from "@agent-plugins/workflows";
import { HOST_NAMES, isHostName, type HostName } from "./host-names.js";

/** What the user agreed the installer may do on their behalf; everything is off until accepted. */
export interface Consent {
  readonly privatePython: boolean;
  readonly installHostClis: boolean;
  readonly headlessDiscovery: boolean;
  readonly codexQuestions: boolean;
}
export const NO_CONSENT: Consent = Object.freeze({ privatePython: false, installHostClis: false, headlessDiscovery: false, codexQuestions: false });

interface PlanFields {
  readonly python: string;
  readonly workflows: readonly string[];
  readonly pluginRoots: readonly string[];
  readonly steps: readonly ToolingStep[];
  readonly knowledge: { readonly knowledgeRoot: string; readonly documentMode: "shared" | "separate"; readonly docsRoot: string; readonly vaultRoot: string };
  readonly consent: Consent;
  readonly answers?: unknown;
  readonly trackerRef?: string;
}
export type Hosts = readonly [HostName, ...HostName[]];
/** The plan the user accepted: every host it sets up. */
export interface AcceptedPlan extends PlanFields { readonly hosts: Hosts }
/** One host's view of the accepted plan; per-host setup code only ever sees this. */
export interface BootstrapInput extends PlanFields { readonly host: HostName }

const RECOVERY = "Correct the setup plan and run the installer again; existing configuration is preserved.";
const invalid = (message: string): Result<never> => fail("invalid-bootstrap", message, RECOVERY);
const check = (valid: boolean, message: string): Result<true> => valid ? ok(true) : invalid(message);

const strings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(text);
const unique = (values: readonly unknown[]): boolean => new Set(values).size === values.length;
const relativeRoot = (value: unknown): value is string => text(value) && !value.startsWith("/") && !/^[A-Za-z]:/.test(value)
  && !value.includes("\\") && value.split("/").every((part) => part !== ".." && part !== "" && part !== ".");
const knowledgeValid = (value: unknown): boolean => object(value)
  && [value.knowledgeRoot, value.docsRoot, value.vaultRoot].every(relativeRoot)
  && (value.documentMode === "shared" || value.documentMode === "separate")
  && (value.documentMode !== "shared" || value.docsRoot === value.vaultRoot);
const workflowsValid = (value: unknown): boolean => strings(value) && value.length > 0 && unique(value)
  && value.every((name) => Object.hasOwn(WORKFLOWS, name));
const stepsValid = (value: unknown): boolean => value === undefined
  || strings(value) && value.every((step) => (TOOLING_STEPS as readonly string[]).includes(step));
const consentValid = (value: unknown): boolean => value === undefined
  || object(value) && Object.keys(NO_CONSENT).every((key) => value[key] === undefined || typeof value[key] === "boolean");

const HOSTS_EXAMPLE = `Choose one or more of ${HOST_NAMES.join(", ")}, for example "hosts": ["codex", "claude"].`;
/** A legacy single `host` reads as a one-host list; given together, `host` must name the first host. */
const listedHosts = (value: JsonObject): unknown => value.hosts ?? (value.host === undefined ? undefined : [value.host]);
const hostsValid = (value: JsonObject, listed: unknown): listed is Hosts => Array.isArray(listed) && listed.length > 0
  && listed.every(isHostName) && unique(listed) && (value.host === undefined || value.host === listed[0]);

/** Each field is checked in turn; the first invalid one is reported with its own message. */
const FIELD_CHECKS: readonly ((value: JsonObject) => Result<true>)[] = [
  (value) => check(hostsValid(value, listedHosts(value)), `The setup plan's hosts are not valid. ${HOSTS_EXAMPLE}`),
  (value) => check(text(value.python), "Name a Python 3.12+ executable, for example \"python\": \"python3.12\"."),
  (value) => check(workflowsValid(value.workflows), `Choose one or more distinct workflows from ${Object.keys(WORKFLOWS).join(", ")}, for example "workflows": ["code-review"].`),
  (value) => check(strings(value.pluginRoots), "List plugin roots as folder names, for example \"pluginRoots\": []."),
  (value) => check(knowledgeValid(value.knowledge), "Give project-relative knowledge and document folders, for example \"knowledgeRoot\": \".project-knowledge/knowledge\"; shared documents use one folder for docs and vault."),
  (value) => check(stepsValid(value.steps), `Limit steps to ${TOOLING_STEPS.join(", ")}, or leave them out to run every step.`),
  (value) => check(value.trackerRef === undefined || text(value.trackerRef), "Give the tracker reference as text, for example \"trackerRef\": \"AGE-1\"."),
  (value) => check(consentValid(value.consent), "Give each consent as true or false, for example \"consent\": {\"privatePython\": true}."),
];
const railway = (value: JsonObject): Result<true> => FIELD_CHECKS.reduce<Result<true>>((result, next) => flatMap(result, () => next(value)), ok(true));

const consentOf = (value: unknown): Consent => object(value)
  ? { privatePython: value.privatePython === true, installHostClis: value.installHostClis === true, headlessDiscovery: value.headlessDiscovery === true, codexQuestions: value.codexQuestions === true }
  : NO_CONSENT;
const accepted = (value: JsonObject): AcceptedPlan => ({
  hosts: listedHosts(value) as Hosts,
  python: value.python as string,
  workflows: value.workflows as readonly string[],
  pluginRoots: value.pluginRoots as readonly string[],
  steps: (value.steps ?? TOOLING_STEPS) as readonly ToolingStep[],
  knowledge: value.knowledge as AcceptedPlan["knowledge"],
  consent: consentOf(value.consent),
  ...(value.answers === undefined ? {} : { answers: value.answers }),
  ...(value.trackerRef === undefined ? {} : { trackerRef: value.trackerRef as string }),
});

/** Accepted choices are parsed once; unsupported hosts and arbitrary setup steps cannot appear later. */
export const parseBootstrap = (value: unknown): Result<AcceptedPlan> => object(value)
  ? flatMap(railway(value), () => ok(accepted(value)))
  : invalid("The setup plan must be a JSON object.");

export const forHost = ({ hosts: _hosts, ...plan }: AcceptedPlan, host: HostName): BootstrapInput => ({ ...plan, host });

/** The saved plan keeps `host` beside `hosts` so installers that read only `host` still accept it. */
export const planFile = (plan: AcceptedPlan): JsonObject => ({ ...plan, host: plan.hosts[0] });

/** Per-host entry points refuse a whole plan: its `host` would be missing. */
export const requireHost = (input: unknown): Result<true> => object(input) && isHostName(input.host) ? ok(true)
  : fail("host-required", "A per-host setup step received a plan without a host.", "Pass each host's view of the plan (forHost) to per-host setup.");

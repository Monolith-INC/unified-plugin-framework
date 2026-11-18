import { fail, object, ok, text, TOOLING_STEPS, type Result, type ToolingStep } from "@agent-plugins/project";
import { WORKFLOWS } from "@agent-plugins/workflows";
import { isHostName, type HostName } from "./host-names.js";

export interface BootstrapInput {
  readonly host: HostName;
  readonly python: string;
  readonly workflows: readonly string[];
  readonly pluginRoots: readonly string[];
  readonly steps: readonly ToolingStep[];
  readonly knowledge: { readonly knowledgeRoot: string; readonly documentMode: "shared" | "separate"; readonly docsRoot: string; readonly vaultRoot: string };
  readonly answers?: unknown;
  readonly trackerRef?: string;
}
const strings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(text);
const relativeRoot = (value: unknown): value is string => text(value) && !value.startsWith("/") && !/^[A-Za-z]:/.test(value)
  && !value.includes("\\") && value.split("/").every((part) => part !== ".." && part !== "" && part !== ".");
const knowledge = (value: unknown): value is BootstrapInput["knowledge"] => object(value)
  && [value.knowledgeRoot, value.docsRoot, value.vaultRoot].every(relativeRoot)
  && (value.documentMode === "shared" || value.documentMode === "separate")
  && (value.documentMode !== "shared" || value.docsRoot === value.vaultRoot);

/** Accepted choices are parsed once; unsupported hosts and arbitrary setup steps cannot appear later. */
export const parseBootstrap = (value: unknown): Result<BootstrapInput> => object(value) && isHostName(value.host)
  && text(value.python) && knowledge(value.knowledge) && strings(value.pluginRoots)
  && strings(value.workflows) && value.workflows.every((name) => Object.hasOwn(WORKFLOWS, name))
  && (value.steps === undefined || strings(value.steps) && value.steps.every((step) => (TOOLING_STEPS as readonly string[]).includes(step)))
  && (value.trackerRef === undefined || text(value.trackerRef))
  ? ok({ ...value, steps: value.steps ?? TOOLING_STEPS } as unknown as BootstrapInput)
  : fail("invalid-bootstrap", "Choose a supported host, Python executable, workflows, plugin roots and project-relative knowledge/document paths.",
    "Use project-bootstrap to prepare the concrete setup plan for Codex or Claude Code; preserve other hosts' configuration.");

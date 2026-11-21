import type { ToolingStep } from "@agent-plugins/project";
import type { HostName } from "./host-names.js";

/**
 * How a failure is answered. `auto` repairs and continues; `hand-off` leaves a task for the first agent session;
 * `user-action` needs something only the person can supply; `stop` cannot be repaired; `preserve` protects files
 * the installer must never change on its own.
 */
export type RecoveryClass = "auto" | "hand-off" | "user-action" | "stop" | "preserve";
/** What remains after setup: 0 ready, 2 installed with hand-offs or user actions pending, 1 stopped. */
export type ExitCode = 0 | 1 | 2;
export const EXIT_CODES: Readonly<Record<RecoveryClass, ExitCode>> = Object.freeze({
  auto: 0, "hand-off": 2, "user-action": 2, stop: 1, preserve: 1,
});

/** Tasks the first agent session may run; a closed set, so a hand-off file can never carry free text. */
export const TASK_KINDS = Object.freeze(["knowledge-discovery", "review-setup", "continuity-setup", "host-sign-in"] as const);
export type TaskKind = (typeof TASK_KINDS)[number];

export type RecoveryAction =
  | { readonly kind: "retry" }
  | { readonly kind: "install-private-python" }
  | { readonly kind: "install-host-cli" }
  | { readonly kind: "retry-with-longer-limit" }
  | { readonly kind: "clean-and-redo" }
  | { readonly kind: "take-over-stale-lock" }
  | { readonly kind: "set-aside-and-ask" }
  | { readonly kind: "acquire-knowledge" }
  | { readonly kind: "hand-off"; readonly task: TaskKind }
  | { readonly kind: "none" };

/** What applies when the recovery itself fails, or when there is none to try. */
export interface Outcome {
  readonly class: Exclude<RecoveryClass, "auto">;
  readonly instruction: string;
}
export interface Recovery {
  readonly class: RecoveryClass;
  readonly action: RecoveryAction;
  readonly attempts: number;
  readonly onFailure: Outcome;
}

const stop = (instruction: string): Outcome => ({ class: "stop", instruction });
const auto = (action: RecoveryAction, attempts: number, onFailure: Outcome): Recovery => ({ class: "auto", action, attempts, onFailure });
const final = (outcome: Outcome, action: RecoveryAction = { kind: "none" }): Recovery => ({ class: outcome.class, action, attempts: 0, onFailure: outcome });
const handOff = (task: TaskKind, instruction: string): Recovery => final({ class: "hand-off", instruction }, { kind: "hand-off", task });

const PRESERVE = final({ class: "preserve", instruction: "This file was changed by someone other than the installer, so it was left as it is. Compare it with the backup or the installer's version, keep what you need, then run the installer again." });
const RERUN = "Run the installer again; completed steps are reused.";

/** The step-independent answer to each failure code. Keys are failure codes emitted by setup. */
const BY_CODE: ReadonlyMap<string, Recovery> = new Map<string, Recovery>([
  ["network-unavailable", auto({ kind: "retry" }, 3, stop(`The download could not be reached after three attempts. Check the network connection, then ${RERUN.toLowerCase()}`))],
  ["checksum-mismatch", auto({ kind: "retry" }, 1, stop("A downloaded file did not match its published checksum twice, so nothing was installed from it. Try again later or from another network."))],
  ["python-missing", auto({ kind: "install-private-python" }, 1, stop("A private Python 3.12 could not be installed. Install Python 3.12 or newer, or pass --python <executable>, then run the installer again."))],
  ["platform-unsupported", final(stop("This platform has no supported build of a tool the installer needs. Use Linux or macOS on x86_64 or arm64."))],
  ["extractor-missing", final(stop("The tar program is needed to unpack downloads. Install tar, then run the installer again."))],
  ["unsupported-runtime", final(stop("The knowledge runtime supports Linux and macOS. The rest of setup completed; use a supported machine for project knowledge."))],
  ["invalid-saved-plan", auto({ kind: "set-aside-and-ask" }, 1, stop("The saved setup plan could not be read and could not be set aside. Move .upf-tools/setup-plan.json away, then run the installer again."))],
  ["invalid-settings", final(stop("A project settings file could not be read. A copy was saved beside it; correct the file, then run the installer again."))],
  ["stale-lock", auto({ kind: "take-over-stale-lock" }, 1, stop(`Another installation still holds the lock. Wait for it to finish, then ${RERUN.toLowerCase()}`))],
  ["write-busy", auto({ kind: "retry" }, 2, stop(`A configuration file stayed busy. Close other setup tools, then ${RERUN.toLowerCase()}`))],
  ["write-denied", final(stop("The installer has no permission to write a setup file. Give your user write access to it, then run the installer again."))],
  // Host entries are never recorded as installer-owned, so a differing entry is always someone else's: preserve it.
  ["host-configuration-conflict", final({ class: "preserve", instruction: "An existing assistant configuration entry differs from this setup and was not written by the installer, so it was left as it is. Reconcile the entry the message names, then run the installer again." })],
  ["host-cli-missing", auto({ kind: "install-host-cli" }, 1, { class: "user-action", instruction: "Install the assistant's command-line tool with its official installer, add it to your PATH, then run the installer again." })],
  ["host-sign-in-needed", final({ class: "user-action", instruction: "Sign in to the assistant with its login command, then run the installer again." })],
  ["tool-timeout", auto({ kind: "retry-with-longer-limit" }, 1, stop(`A setup program did not finish in time, even with a longer time limit. ${RERUN}`))],
  ["tool-command-failed", auto({ kind: "retry" }, 1, stop(`A setup program failed. The log names the program and step. ${RERUN}`))],
  ["partial-step", auto({ kind: "clean-and-redo" }, 1, stop(`An interrupted step could not be cleaned up. ${RERUN}`))],
  ["dependency-fetch", auto({ kind: "retry" }, 3, stop(`A pinned dependency could not be fetched. Check the network connection, then ${RERUN.toLowerCase()}`))],
  ["knowledge-discovery-needed", auto({ kind: "acquire-knowledge" }, 1, { class: "hand-off", instruction: "Project knowledge will be collected in your first session: say \"Use the project-bootstrap skill to finish setup\"." })],
  ["tooling-missing", auto({ kind: "retry" }, 1, stop("Follow the reported recovery for this setup capability, then run the installer again."))],
  ["review-setup-needed", handOff("review-setup", "Review provider bindings will be set up in your first session: say \"Use the project-bootstrap skill to finish setup\".")],
  ["continuity-setup-needed", handOff("continuity-setup", "Session continuity will be initialized in your first session: say \"Use the project-bootstrap skill to finish setup\".")],
  ["tracker-attention", final({ class: "user-action", instruction: "Set the tracker's access key in your environment (for Linear, LINEAR_API_KEY), then run the installer again." })],
  ["authentication-needed", final({ class: "user-action", instruction: "Set the tracker credential in your environment, then run the installer again." })],
  ["connection-unavailable", final({ class: "user-action", instruction: "Restore the tracker connection, then run the installer again." })],
  ["tracker-error", final({ class: "user-action", instruction: "Inspect the tracker connection and current item before retrying." })],
  ["outcome-unknown", final({ class: "user-action", instruction: "Check the tracker for the result before retrying any write." })],
  ["invalid-reply", final({ class: "user-action", instruction: "Check the tracker connector and its response, then retry." })],
  ["invalid-scope", final({ class: "user-action", instruction: "Check the selected tracker team and project, then retry." })],
  ["invalid-pagination", final({ class: "user-action", instruction: "Restore the tracker connector's pagination before retrying." })],
  ["invalid-parent", final({ class: "user-action", instruction: "Select a valid parent and retry the request." })],
  ["invalid-request", final({ class: "user-action", instruction: "Correct the request and retry." })],
  ["not-found", final({ class: "user-action", instruction: "Find the existing work item and retry with its identifier." })],
  ["outside-project", final({ class: "user-action", instruction: "Select a work item in the configured project and team." })],
  ["unmapped-kind", final({ class: "user-action", instruction: "Correct the tracker's work-item kind mapping." })],
  ["unmapped-state", final({ class: "user-action", instruction: "Correct the tracker's state mapping." })],
  ["unsupported-operation", final({ class: "user-action", instruction: "Use an adapter that supports the requested operation." })],
  ["artifact-conflict", final({ class: "preserve", instruction: "Read the existing artifact and publish a new revision; do not overwrite it." })],
  ["invalid-local-store", final({ class: "preserve", instruction: "Restore the local work-item store from a readable copy; existing records were preserved." })],
  ["setup-needed", final({ class: "user-action", instruction: "Complete the missing project settings, then retry." })],
  ["storage-error", final(stop("Project files could not be read or saved. Check access and preserve existing files before retrying."))],
  ["project-busy", final(stop("Another process is updating project records. Wait for it to finish before retrying."))],
  ["settings-changed", PRESERVE],
  ["unsupported-settings", PRESERVE],
  ["invalid-json", final(stop("The input JSON could not be read. Correct it and retry."))],
  ["unreadable-input", final(stop("The input file could not be read. Check its path and retry."))],
  ["usage", final(stop("Check the command options and supply the accepted input plan."))],
  ["missing-input", final(stop("Supply --input with the accepted input plan, then run the command again."))],
  ["answers-required", final(stop("Some setup choices are missing. Run the installer in a terminal to answer them, or complete the --input plan."))],
  ["invalid-bootstrap", final(stop("The setup plan is not valid. Correct it as the message describes, then run the installer again."))],
  ["host-required", final(stop("A per-host step received the whole plan. This is an installer defect; report it with the log."))],
  ["symlink-escape", PRESERVE],
  ["modified-file", PRESERVE],
  ["unmanaged-file", PRESERVE],
  ["active-skill-drift", PRESERVE],
  ["dependency-fetch-mismatch", PRESERVE],
  ["dependency-source", PRESERVE],
  ["dependency-pin", PRESERVE],
  ["dependency-binding", PRESERVE],
  ["distribution-incomplete", final(stop("The release archive is incomplete. Download the installer again, then run it."))],
  ["host-unavailable", auto({ kind: "install-host-cli" }, 1, { class: "user-action", instruction: "The assistant's command-line tool is not available. Install it, then run the installer again." })],
  ["host-skill-errors", auto({ kind: "retry" }, 1, stop(`The assistant reported errors loading skills. ${RERUN}`))],
  ["host-activation-needed", auto({ kind: "retry" }, 1, stop(`Pinned dependencies were not staged. ${RERUN}`))],
  ["handoff-storage", final(stop("The pending setup tasks could not be verified or saved. Existing task files were kept; check that your state folder (XDG_STATE_HOME or ~/.local/state) is private and writable, then run the installer again."))],
  ["tooling-storage", auto({ kind: "retry" }, 1, stop(`A setup file could not be written. Check its permissions, then ${RERUN.toLowerCase()}`))],
]);

/** Step-specific answers that override the code's general one. */
const BY_STEP: ReadonlyMap<string, Recovery> = new Map<string, Recovery>([
  ["knowledge-server:tooling-missing", auto({ kind: "retry" }, 1, { class: "hand-off", instruction: "The knowledge server will be checked again in your first session: say \"Use the project-bootstrap skill to finish setup\"." })],
]);

/** Anything the table does not name is unexpected: it stops that step and is reported with the log. */
export const UNEXPECTED: Recovery = final(stop("An unexpected setup error occurred. The log has the details; run the installer again, and report it if it repeats."));

export const RECOVERY_CODES: readonly string[] = Object.freeze([...BY_CODE.keys()]);
export const recoveryFor = (step: ToolingStep | "launcher", code: string): Recovery =>
  BY_STEP.get(`${step}:${code}`) ?? BY_CODE.get(code) ?? UNEXPECTED;
export const exitCodeOf = (outcome: RecoveryClass): ExitCode => EXIT_CODES[outcome];

/** Exact versions and checksums of everything the installer may download. */
export const PINS = Object.freeze({
  uv: Object.freeze({
    version: "0.13.7",
    archives: Object.freeze({
      "x86_64-unknown-linux-gnu": "c5221ff41b7892bfc223543883600125f6a47fe845093e0f5bdff4f359196d83",
      "aarch64-unknown-linux-gnu": "71279f8d3c67241e807b9d8db872d1bf541579fb9f08b7d1eb1682196d1e57dc",
      "x86_64-unknown-linux-musl": "287491da03f2a785c70fa75b13e1f849918c2f2b5415fe84876b8214eeb792f9",
      "aarch64-unknown-linux-musl": "2d3ec076a0c4c0e8250bb6418c44080828b544f1a3be0b6e46adf9fb6923de45",
      "x86_64-apple-darwin": "20c47e4c1f630b8abaff8c291fa9b9aa300fef92c4fbff95adf198b55287cda7",
      "aarch64-apple-darwin": "81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731",
    } as Readonly<Record<string, string>>),
  }),
  /** The pinned uv verifies this interpreter against its own published checksums. */
  python: "3.12.16",
  hostClis: Object.freeze({
    claude: Object.freeze({ package: "@anthropic-ai/claude-code", version: "2.1.318", integrity: "sha512-OTJgLxcvWefv8IdTsq5n90Z2IxEhLwKqHUBhwZYE4odXzKA/Tb6p2Zb5Iy9Vq7JIVcNZzn9cPxW5sb42wLF95Q==" }),
    codex: Object.freeze({ package: "@openai/codex", version: "0.166.0", integrity: "sha512-2Szlp1l1cz5TX1ccpX4Zok3DZrot9xeZe0km+6/1v8JmqxADwyJxKBJah4dBymkwtS25j/u6dipJusTOI97Z8Q==" }),
  } satisfies Record<HostName, { readonly package: string; readonly version: string; readonly integrity: string }>),
});

export const DISCOVERY_COMPLETE = "UPF_DISCOVERY_COMPLETE";
export const DISCOVERY_MARKER = ".upf-discovery-complete";
const DISCOVERY_PROMPT = `Use repository_list and repository_read to identify the project structure, conventions and verification commands. Record source-backed project knowledge using the knowledge tools. Each unit needs YAML frontmatter with id, tier, type, area, title, read_when, provenance, sources, and status. Use derived provenance for observations, current status, repository paths for sources, and if_version=new for new units. Read and preserve existing units. Reply with exactly ${DISCOVERY_COMPLETE} once the saved store covers the observed structure, conventions and verification commands.`;
const KNOWLEDGE_TOOLS = ["knowledge_catalog", "knowledge_find", "knowledge_fetch", "knowledge_links", "knowledge_put", "knowledge_patch", "knowledge_add"] as const;
const REPOSITORY_TOOLS = ["repository_list", "repository_read"] as const;

export interface DiscoveryInput {
  readonly project: string;
  readonly runtime: string;
  readonly isolatedDirectory: string;
  readonly knowledgeRoot: string;
}

const discoveryServers = ({ project, runtime, knowledgeRoot }: DiscoveryInput) => [
  { name: "project-knowledge", command: runtime, args: ["--project", project, "--root", knowledgeRoot], tools: KNOWLEDGE_TOOLS },
  { name: "project-repository", command: runtime, args: ["--project", project, "--read-repository"], tools: REPOSITORY_TOOLS },
] as const;

const codexServerArgs = ({ name, command, args, tools }: ReturnType<typeof discoveryServers>[number]): readonly string[] => [
  "-c", `mcp_servers.${name}.command=${JSON.stringify(command)}`,
  "-c", `mcp_servers.${name}.args=${JSON.stringify(args)}`,
  "-c", `mcp_servers.${name}.enabled_tools=${JSON.stringify(tools)}`,
  "-c", `mcp_servers.${name}.required=true`,
  ...tools.flatMap((tool) => ["-c", `mcp_servers.${name}.tools.${tool}.approval_mode="approve"`]),
];

const claudeArgs = (input: DiscoveryInput): readonly string[] => {
  const servers = discoveryServers(input);
  const mcpServers = Object.fromEntries(servers.map(({ name, command, args }) => [name, { command, args }]));
  const tools = servers.flatMap(({ name, tools }) => tools.map((tool) => `mcp__${name}__${tool}`));
  return ["-p", "--tools", "", "--permission-mode", "dontAsk", "--max-turns", "16",
    "--setting-sources", "user", "--strict-mcp-config", "--mcp-config", JSON.stringify({ mcpServers }),
    "--allowedTools", tools.join(","), "--", DISCOVERY_PROMPT];
};

/** The caller must launch from a fresh installer-owned directory outside the repository. */
export const headlessDiscovery = (host: HostName, input: DiscoveryInput): readonly string[] => {
  switch (host) {
    case "claude": return claudeArgs(input);
    case "codex": return ["--disable", "hooks", "--disable", "plugins", "--disable", "shell_tool",
      "--disable", "apps", "--disable", "multi_agent", "--disable", "multi_agent_v2",
      "--disable", "browser_use", "--disable", "computer_use", "--disable", "image_generation",
      "-a", "never", "exec", "--ignore-user-config", "--ephemeral", "--sandbox", "read-only",
      "--skip-git-repo-check", "-C", input.isolatedDirectory, "-c", 'web_search="disabled"',
      ...discoveryServers(input).flatMap(codexServerArgs), DISCOVERY_PROMPT];
  }
};

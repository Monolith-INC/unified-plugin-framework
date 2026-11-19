import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { releasePayloads } from "@agent-plugins/workflows";

import { claudeAdapter } from "../dist/index.js";
import { officialFailures } from "./official-check.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const payloadsRoot = join(packageRoot, "payloads");
const operation = process.argv[2] ?? "";
const nonEmpty = (value) => (value?.trim() ? value : undefined);
const CLI = nonEmpty(process.env["CLAUDE_CODE_CLI"]) ?? "claude"; // fp-allow: no-ambient-effect
const TIMEOUT_MS = 120_000;

/** How to start the CLI here: Windows starts the npm shim through cmd.exe, which takes one quoted command line. */
const command = (args) =>
  process.platform === "win32"
    ? { file: [CLI, ...args].map((part) => `"${part}"`).join(" "), argv: [], shell: true }
    : { file: CLI, argv: args, shell: false };

// Boundary: runs Claude Code's CLI once and returns spawnSync's result.
const runCli = (args) => {
  const { file, argv, shell } = command(args);
  return spawnSync(file, argv, { encoding: "utf8", shell, timeout: TIMEOUT_MS });
};

const built = releasePayloads(operation, claudeAdapter, { pluginsRoot: resolve(packageRoot, "../../plugins"), payloadsRoot });
// Claude Code is the authority on what it loads, so a verified payload must also pass its own validator.
const reports = [
  ...built,
  ...officialFailures({ operation, reports: built, payloadDir: (plugin) => join(payloadsRoot, plugin, "payload"), cli: CLI, run: runCli }),
];

process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
if (reports.some(({ result }) => !result.ok)) process.exitCode = 1;

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { releasePayloads } from "@agent-plugins/workflows";

import { claudeAdapter } from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const payloadsRoot = join(packageRoot, "payloads");
const operation = process.argv[2] ?? "";
const CLAUDE = process.env["CLAUDE_CODE_CLI"] ?? "claude";
const MISSING_CLI = `Claude Code's CLI (${CLAUDE}) did not run. Install it with npm install -g @anthropic-ai/claude-code, or set CLAUDE_CODE_CLI to its path, then run payload:verify again.`;

/** The command line for Claude Code's own manifest check; `--strict` makes its warnings fail too. */
const validateArgs = (plugin) => ["plugin", "validate", "--strict", join(payloadsRoot, plugin, "payload")];

// Boundary: runs Claude Code's validator on one built payload. Windows runs the npm shim through cmd.exe.
const officialCheck = (plugin) => {
  const run = process.platform === "win32"
    ? spawnSync([CLAUDE, ...validateArgs(plugin)].map((part) => `"${part}"`).join(" "), { encoding: "utf8", shell: true })
    : spawnSync(CLAUDE, validateArgs(plugin), { encoding: "utf8" });
  return { plugin, ok: run.status === 0, output: run.error === undefined ? `${run.stdout}${run.stderr}`.trim() : MISSING_CLI };
};

const reports = releasePayloads(operation, claudeAdapter, { pluginsRoot: resolve(packageRoot, "../../plugins"), payloadsRoot });
// Claude Code is the authority on what it loads, so a verified payload must also pass its validator.
const official = operation === "verify" && reports.every(({ result }) => result.ok) ? reports.map(({ plugin }) => officialCheck(plugin)) : [];

process.stdout.write(`${JSON.stringify({ reports, official }, null, 2)}\n`);
if ([...reports.map(({ result }) => result.ok), ...official.map(({ ok }) => ok)].includes(false)) process.exitCode = 1;

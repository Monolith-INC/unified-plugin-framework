// Claude Code's own validator as a release check. Pure: the one effect, running the CLI, is the `run` capability.

/** Claude Code's command line for checking one payload; `--strict` turns its warnings into failures. */
export const validateArgs = (payloadDir) => ["plugin", "validate", "--strict", payloadDir];

/** A cheap call that only succeeds when the CLI can start at all. */
export const PROBE_ARGS = Object.freeze(["--version"]);

export const unavailableMessage = (cli) =>
  `Claude Code's CLI (${cli}) could not run. Install it with npm install -g @anthropic-ai/claude-code, or set CLAUDE_CODE_CLI to its path, then run payload:verify again.`;

/** A failed report in the release shape, so it joins the build reports unchanged. */
const failed = (plugin, code, message) => ({ plugin, result: { ok: false, diagnostics: [{ severity: "error", code, message, path: plugin }] } });

/** A run that started and exited 0, as opposed to one that never started, failed, timed out or was killed. */
const succeeded = (run) => run.error === undefined && run.status === 0;

/** What a failed validator run printed, plus why it stopped when it did not exit on its own. */
const failureText = (run) =>
  [run.error?.message, run.signal ? `stopped by ${run.signal}` : undefined, `${run.stdout ?? ""}${run.stderr ?? ""}`.trim()]
    .filter((part) => part !== undefined && part !== "")
    .join("\n");

const verdict = (plugin, run) =>
  succeeded(run) ? [] : [failed(plugin, "claude.official.rejected", `claude plugin validate --strict rejected the payload:\n${failureText(run)}`)];

/**
 * Failed reports from Claude Code's validator for each built payload. Only `verify` runs it, and only once every build
 * passed. A CLI that cannot start yields one `claude.official.unavailable` report with the recovery instruction.
 */
export const officialFailures = ({ operation, reports, payloadDir, cli, run }) =>
  operation !== "verify" || reports.some(({ result }) => !result.ok)
    ? []
    : succeeded(run(PROBE_ARGS))
      ? reports.flatMap(({ plugin }) => verdict(plugin, run(validateArgs(payloadDir(plugin)))))
      : [failed("claude", "claude.official.unavailable", unavailableMessage(cli))];

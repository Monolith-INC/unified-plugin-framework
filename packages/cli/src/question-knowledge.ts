import { isAbsolute } from "node:path";
import { object } from "@agent-plugins/project";
import type { QuestionRecoveryLookup, QuestionRecoveryUnit } from "@agent-plugins/workflows";
import { command } from "./tooling-process.js";

const guidance = (text: string, unit: QuestionRecoveryUnit): string | null => {
  try {
    const value: unknown = JSON.parse(text);
    return object(value) && value.ok === true && value.id === unit && value.status === "current" &&
      value.truncated === false && typeof value.content === "string" && value.content.length <= 8_192
      ? value.content : null;
  } catch {
    return null;
  }
};

/** Fetch only the exact recovery unit using the configured Project Knowledge launcher. */
export const questionKnowledge = (launcher: string, project: string, node: string): QuestionRecoveryLookup =>
  (unit) => () => command(node, [launcher, "fetch", "--project", project, unit, "--max-tokens", "500"], project, 1_500)
    .then((result) => result.ok ? guidance(result.value, unit) : null);

/** A trusted launcher is configured explicitly, outside model tool arguments. */
export const recoveryLauncher = (args: readonly string[]): string | null =>
  args.length === 3 && args[1] === "--knowledge-launcher" && args[2] !== undefined && isAbsolute(args[2]) ? args[2] : null;

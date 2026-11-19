import { join } from "node:path";
import { fail, object, ok, parseJson, type Result } from "@agent-plugins/project";
import { readText, safePath, writeText } from "./tooling-files.js";

export interface OwnershipLedger {
  readonly path: string;
  readonly text: string | null;
  readonly entries: Readonly<Record<string, unknown>>;
}

const invalidLedger = (): Result<never> => fail("invalid-settings", "The installer ownership ledger cannot be read.",
  "Preserve the ownership ledger and reconcile its contents before replacing any installer-owned file.");

export const readOwnership = async (project: string): Promise<Result<OwnershipLedger>> => {
  const path = join(project, ".upf-tools", "owned.json");
  const safe = await safePath(project, path);
  const text = safe ? await readText(path) : invalidLedger();
  const decoded = text.ok ? text.value === null ? ok({ entries: {} }) : parseJson(text.value) : text;
  return text.ok && decoded.ok && object(decoded.value) && object(decoded.value.entries)
    ? ok({ path, text: text.value, entries: decoded.value.entries }) : invalidLedger();
};

export const recordOwnership = (project: string, ledger: OwnershipLedger, file: string, digest: string, python: string): Promise<Result<string>> =>
  Object.hasOwn(ledger.entries, file) && ledger.entries[file] === digest ? Promise.resolve(ok(ledger.path))
    : writeText(project, ledger.path, JSON.stringify({ entries: { ...ledger.entries, [file]: digest } }, null, 2), ledger.text, python);

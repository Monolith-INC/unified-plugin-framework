import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { WorkflowAdapter } from "./adapter.js";
import { EMPTY_LOCK, LOCK_FILE, parseLock, type OnboardedLock, type ParsedLock } from "./lock.js";
import { renderSkill } from "./render.js";

/** Assembled skills (skill directory name → SKILL.md text), or every problem found. */
export type Assembled =
  | { readonly ok: true; readonly skills: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly problems: readonly string[] };

const PLACEHOLDER = /\{\{[a-z]+\}\}/;

/** Each operation and the adapters claiming it. */
const claims = (adapters: readonly WorkflowAdapter<string>[]): ReadonlyMap<string, readonly WorkflowAdapter<string>[]> =>
  adapters
    .flatMap((adapter) => Object.keys(adapter.fulfil).map((operation) => [operation, adapter] as const))
    .reduce<ReadonlyMap<string, readonly WorkflowAdapter<string>[]>>(
      (index, [operation, adapter]) => new Map([...index, [operation, [...(index.get(operation) ?? []), adapter]]]),
      new Map(),
    );

type SkillResult = { readonly ok: true; readonly name: string; readonly text: string } | { readonly ok: false; readonly problem: string };

const assembleOne = (index: ReadonlyMap<string, readonly WorkflowAdapter<string>[]>, lock: OnboardedLock) =>
  ([name, text]: readonly [string, string]): SkillResult => {
    const [adapter, ...others] = index.get(name) ?? [];
    const rendered = adapter === undefined ? undefined : renderSkill(text, adapter, name, lock);
    return !PLACEHOLDER.test(text)
      ? { ok: true, name, text }
      : adapter === undefined
        ? { ok: false, problem: `Skill ${name} has placeholders but is no workflow's contract operation.` }
        : others.length > 0
          ? { ok: false, problem: `Operation ${name} is claimed by more than one workflow.` }
          : rendered?.ok === true
            ? { ok: true, name, text: rendered.text }
            : { ok: false, problem: `Skill ${name}: ${rendered?.ok === false ? rendered.message : "not rendered"}` };
  };

/** Renders each template skill from the adapter whose contract names it and the framework's lock; others pass through. Pure. */
export const assembleSkills = (
  skills: ReadonlyMap<string, string>,
  adapters: readonly WorkflowAdapter<string>[],
  lock: OnboardedLock,
): Assembled => {
  const results = [...skills].map(assembleOne(claims(adapters), lock));
  const problems = results.flatMap((result) => (result.ok ? [] : [result.problem]));
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, skills: new Map(results.flatMap((result) => (result.ok ? [[result.name, result.text] as const] : []))) };
};

// Effect boundary: release scripts assemble a plugin source into a fresh staging directory.

const skillFile = (root: string, name: string): string => join(root, "skills", name, "SKILL.md");

const readSkills = (root: string): ReadonlyMap<string, string> =>
  new Map(
    (existsSync(join(root, "skills")) ? readdirSync(join(root, "skills")) : [])
      .filter((name) => existsSync(skillFile(root, name)))
      .map((name) => [name, readFileSync(skillFile(root, name), "utf8")] as const),
  );

/** The plugin's lock: absent is the empty lock, so only a plugin with template skills needs one. */
const readLock = (root: string): ParsedLock =>
  existsSync(join(root, LOCK_FILE)) ? parseJsonLock(readFileSync(join(root, LOCK_FILE), "utf8")) : { ok: true, lock: EMPTY_LOCK };

const parseJsonLock = (text: string): ParsedLock => {
  try {
    return parseLock(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, message: `${LOCK_FILE} is not valid JSON.` };
  }
};

/**
 * Copies the plugin at `sourceRoot` to `stagingRoot` and writes its assembled skills there. The source is never
 * modified, and an existing staging directory is refused rather than overwritten.
 */
export const assemblePluginSource = (
  sourceRoot: string,
  stagingRoot: string,
  adapters: readonly WorkflowAdapter<string>[],
): Assembled => {
  if (existsSync(stagingRoot)) return { ok: false, problems: [`Staging directory ${stagingRoot} already exists.`] };
  const lock = readLock(sourceRoot);
  if (!lock.ok) return { ok: false, problems: [lock.message] };
  const assembled = assembleSkills(readSkills(sourceRoot), adapters, lock.lock);
  if (!assembled.ok) return assembled;
  cpSync(sourceRoot, stagingRoot, { recursive: true });
  [...assembled.skills].map(([name, text]) => writeFileSync(skillFile(stagingRoot, name), text));
  return assembled;
};

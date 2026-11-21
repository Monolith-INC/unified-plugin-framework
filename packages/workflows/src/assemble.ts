import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Monoid, WorkflowAdapter } from "./adapter.js";
import { EMPTY_LOCK, LEGACY_LOCK_FILE, LOCK_FILE, parseLock, type OnboardedLock, type ParsedLock } from "./lock.js";
import { concatAll } from "./questions.js";
import { renderSkill } from "./render.js";

/** Assembled skills (skill directory name → SKILL.md text), or every problem found. */
export type Assembled =
  | { readonly ok: true; readonly skills: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly problems: readonly string[] };

const PLACEHOLDER = /\{\{[a-z]+\}\}/;

type ClaimIndex = ReadonlyMap<string, readonly WorkflowAdapter<string>[]>;

const claimIndexMonoid: Monoid<ClaimIndex> = Object.freeze({
  empty: new Map(),
  concat: (left: ClaimIndex, right: ClaimIndex): ClaimIndex =>
    new Map(
      [...new Set([...left.keys(), ...right.keys()])].map((key) => [
        key,
        [...(left.get(key) ?? []), ...(right.get(key) ?? [])],
      ]),
    ),
});

/** Each operation and the adapters claiming it. */
const claims = (adapters: readonly WorkflowAdapter<string>[]): ClaimIndex =>
  concatAll(claimIndexMonoid)(
    adapters.flatMap((adapter) =>
      Object.keys(adapter.fulfil).map((operation) => new Map([[operation, [adapter] as readonly WorkflowAdapter<string>[]]])),
    ),
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

const lockPath = (root: string): string | undefined =>
  existsSync(join(root, LOCK_FILE))
    ? join(root, LOCK_FILE)
    : existsSync(join(root, LEGACY_LOCK_FILE))
      ? join(root, LEGACY_LOCK_FILE)
      : undefined;

/** The plugin's lock: absent is the empty lock, so only a plugin with template skills needs one. */
const readLock = (root: string): ParsedLock => {
  const path = lockPath(root);
  return path === undefined ? { ok: true, lock: EMPTY_LOCK } : parseJsonLock(readFileSync(path, "utf8"));
};

const parseJsonLock = (text: string): ParsedLock => {
  try {
    return parseLock(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, message: `${LOCK_FILE} is not valid JSON.` };
  }
};

const ALLOWLIST_FILES: readonly string[] = Object.freeze(["plugin.json", "mcp.json", "LICENSE", "NOTICE", LEGACY_LOCK_FILE]);
const ALLOWLIST_DIRS: readonly string[] = Object.freeze(["skills"]);
const SAFE_NAMESPACE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

type ExtensionDirsResult = { readonly ok: true; readonly dirs: readonly string[] } | { readonly ok: false; readonly problem: string };

const declaredExtensionDirs = (root: string): ExtensionDirsResult => {
  const manifestPath = join(root, "plugin.json");
  if (!existsSync(manifestPath)) return { ok: true, dirs: [] };
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    const ext = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>).extensions
      : undefined;
    return {
      ok: true,
      dirs:
        typeof ext === "object" && ext !== null && !Array.isArray(ext)
          ? Object.keys(ext).filter((ns) => SAFE_NAMESPACE.test(ns) && !ns.includes(".."))
          : [],
    };
  } catch {
    return { ok: false, problem: `Manifest ${manifestPath} is not valid JSON.` };
  }
};

const isExistingDirectory = (path: string): boolean => existsSync(path) && lstatSync(path).isDirectory();

const copyAllowlisted = (sourceRoot: string, stagingRoot: string, extensionDirs: readonly string[]): void => {
  mkdirSync(stagingRoot, { recursive: true });
  const files = ALLOWLIST_FILES.filter((name) => existsSync(join(sourceRoot, name)) && !lstatSync(join(sourceRoot, name)).isDirectory());
  const dirs = [...new Set([...ALLOWLIST_DIRS, ...extensionDirs])].filter((name) => isExistingDirectory(join(sourceRoot, name)));
  files.forEach((name) => cpSync(join(sourceRoot, name), join(stagingRoot, name)));
  dirs.forEach((name) => cpSync(join(sourceRoot, name), join(stagingRoot, name), { recursive: true }));
};

/**
 * Copies only the v1.0.0 plugin allowlist from `sourceRoot` to `stagingRoot` and writes its assembled skills there.
 * The source is never modified, non-plugin repo files never leak, and an existing staging directory is refused.
 */
export const assemblePluginSource = (
  sourceRoot: string,
  stagingRoot: string,
  adapters: readonly WorkflowAdapter<string>[],
): Assembled => {
  if (!isExistingDirectory(sourceRoot)) return { ok: false, problems: [`Plugin source ${sourceRoot} is not a readable directory.`] };
  if (existsSync(stagingRoot)) return { ok: false, problems: [`Staging directory ${stagingRoot} already exists.`] };
  const extDirs = declaredExtensionDirs(sourceRoot);
  if (!extDirs.ok) return { ok: false, problems: [extDirs.problem] };
  const lock = readLock(sourceRoot);
  if (!lock.ok) return { ok: false, problems: [lock.message] };
  const assembled = assembleSkills(readSkills(sourceRoot), adapters, lock.lock);
  if (!assembled.ok) return assembled;
  copyAllowlisted(sourceRoot, stagingRoot, extDirs.dirs);
  assembled.skills.forEach((text, name) => writeFileSync(skillFile(stagingRoot, name), text));
  return assembled;
};

import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const MEMLOG = ".memlog.md";
const REPORT = "forge-report.html";

export const FORGE_RECORD_RECOVERY =
  "Restore the project-local Forge .memlog.md with status complete and its adjacent forge-report.html, or resume the installed Forge skill to regenerate them.";

const inside = (root: string, file: string): boolean => {
  const path = relative(root, file);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

const resolveRecord = (root: string, path: string, filename: string): string | undefined => {
  const requested = resolve(root, path);
  if (basename(requested) !== filename || !inside(root, requested)) return undefined;
  const actual = realpathSync(requested);
  return actual === requested && statSync(actual).isFile() ? actual : undefined;
};

const completedMemlog = (content: string): boolean => {
  const match = /^---\r?\n([\s\S]*?)^---\r?\n/m.exec(content);
  const fields = match?.[1] ?? "";
  return match?.index === 0 && /^status:[ \t]*complete[ \t]*\r?$/m.test(fields)
    && /^-\s+\S/m.test(content.slice(match[0].length));
};

/** Read only regular project-local artifacts, using the layout written by the installed Forge skill. */
export const hasCompletedForgeRecord = (project: string, path: string | undefined): boolean => {
  if (path === undefined) return false;
  try {
    const root = realpathSync(project);
    const localPath = isAbsolute(path) ? relative(resolve(project), path) : path;
    const memlog = resolveRecord(root, localPath, MEMLOG);
    const report = memlog === undefined ? undefined : resolveRecord(root, resolve(dirname(memlog), REPORT), REPORT);
    return memlog !== undefined && report !== undefined && completedMemlog(readFileSync(memlog, "utf8"))
      && /^\s*(?:<!doctype html\s*>\s*)?<html[\s>]/i.test(readFileSync(report, "utf8"));
  } catch {
    return false; // Missing, inaccessible, or invalid paths require Forge recovery.
  }
};

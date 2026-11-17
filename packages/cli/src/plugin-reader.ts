import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import {
  canonicalText,
  failure,
  normalizeCanonicalPlugin,
  sha256,
  stableJson,
  success,
  type JsonValue,
  type Result,
} from "@agent-plugins/compiler";
import { loadPluginRoot, type Diagnostic } from "@agent-plugins/core";

import type { JsonFile, PluginFactsIo, PluginRead } from "./plugin-facts.js";

// Edge interpreters: everything here reads the real filesystem. The pure resolution lives in plugin-facts.ts.

export const readJsonFromDisk = (path: string): JsonFile => {
  if (!existsSync(path)) return { kind: "absent" };
  try {
    return { kind: "value", value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch {
    return { kind: "unreadable", path };
  }
};

const readerDiagnostic = (code: string, message: string, path: string): Diagnostic => ({ severity: "error", code, message, path });

/** Names in code-point order, built without sorting in place. */
export const sortedNames = (names: readonly string[]): readonly string[] =>
  names.reduce<readonly string[]>((sorted, name) => [...sorted.filter((x) => x < name), name, ...sorted.filter((x) => x >= name)], []);

/** Every regular file under `dir`, by path relative to `base`; symbolic links are not followed. */
const filesUnder = (base: string, dir: string): readonly string[] =>
  sortedNames(readdirSync(dir)).flatMap((name) => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    return stat.isDirectory() ? filesUnder(base, path) : stat.isFile() ? [path.slice(base.length + 1).split("\\").join("/")] : [];
  });

/** A file's digest: text with line endings and a byte-order mark normalised, anything else byte for byte. */
const fileDigest = (path: string): string => {
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  return Buffer.from(text, "utf8").equals(bytes) ? sha256(canonicalText(text)) : sha256(bytes);
};

/** Reuse canonical path ordering and text normalization to verify a complete active skill tree. */
export const readContentTree = (root: string): Result<string> => {
  try {
    const stat = lstatSync(root);
    return !stat.isDirectory() || stat.isSymbolicLink() ? failure(readerDiagnostic("plugin.skill.unsafe", "The active skill directory is not a regular directory.", root))
      : success(sha256(stableJson(filesUnder(root, root).filter((path) => path !== ".upf-source")
        .map((path) => ({ path, sha256: fileDigest(join(root, path)) })))));
  } catch {
    return failure(readerDiagnostic("plugin.skill.unreadable", "The active skill content cannot be verified.", root));
  }
};

/** The skill folders under `skills/` that hold a `SKILL.md`, in name order. */
const skillNames = (skillsDir: string): readonly string[] =>
  existsSync(skillsDir) ? sortedNames(readdirSync(skillsDir).filter((name) => existsSync(join(skillsDir, name, "SKILL.md")))) : [];

const manifestField = (file: JsonFile, key: string): string | undefined => {
  const value = file.kind === "value" && typeof file.value === "object" && file.value !== null ? (file.value as Readonly<Record<string, unknown>>)[key] : undefined;
  return typeof value === "string" ? value : undefined;
};

/**
 * A plugin made of `skills/<name>/` folders, with an optional Claude Code manifest at `.claude-plugin/plugin.json`.
 * The checksum covers the parsed manifest, if any, and every regular file in every skill folder, not only `SKILL.md`.
 */
const readSkillsPlugin = (root: string): Result<PluginRead> => {
  const manifest = readJsonFromDisk(join(root, ".claude-plugin", "plugin.json"));
  const skillsDir = join(root, "skills");
  const skills = skillNames(skillsDir);
  const files = skills.flatMap((skill) => filesUnder(skillsDir, join(skillsDir, skill)));
  return manifest.kind === "unreadable"
    ? failure(readerDiagnostic("plugin.manifest.unreadable", "The Claude Code plugin manifest is not valid JSON.", manifest.path))
    : skills.length === 0
      ? failure(readerDiagnostic("plugin.root.unrecognised", "No plugin manifest and no skills/<name>/SKILL.md were found.", root))
      : success({
          name: manifestField(manifest, "name"),
          version: manifestField(manifest, "version"),
          checksum: sha256(
            stableJson({
              manifest: manifest.kind === "value" ? (manifest.value as JsonValue) : null,
              files: files.map((path) => ({ path, sha256: fileDigest(join(skillsDir, path)) })),
            }),
          ),
          skills,
        });
};

/** A portable plugin, read by the compiler as for payloads; its checksum is the compiler's source digest. */
const readPortablePlugin = (root: string): Result<PluginRead> => {
  const canonical = normalizeCanonicalPlugin(root);
  return canonical.ok
    ? success({
        name: canonical.value.manifest.name,
        version: canonical.value.manifest.version,
        checksum: canonical.value.sourceDigest,
        skills: canonical.value.skills.map(({ path }) => basename(dirname(path))),
      })
    : canonical;
};

/** Reads a plugin root by the layout found there; a filesystem error is a diagnostic, not a crash. */
const readPluginFromDisk = (root: string, publicPaths: ReadonlyMap<string, readonly string[]> = new Map(), name?: string): Result<PluginRead> => {
  try {
    const read = existsSync(join(root, "plugin.json")) ? readPortablePlugin(root) : readSkillsPlugin(root);
    const paths = read.ok ? publicPaths.get(read.value.name ?? name ?? "") ?? [] : [];
    return read.ok && paths.length > 0 ? withPublicFiles(root, read.value, paths) : read;
  } catch (error) {
    return failure(readerDiagnostic("plugin.root.unreadable", error instanceof Error ? error.message : String(error), root));
  }
};

const safePublicFile = (root: string, path: string): boolean => !path.includes("\\") && !path.split("/").includes("..")
  && relative(resolve(root), resolve(root, path)).split("\\").join("/") === path
  && path.split("/").every((_, index, parts) => !lstatSync(join(root, ...parts.slice(0, index + 1))).isSymbolicLink());
const withPublicFiles = (root: string, plugin: PluginRead, paths: readonly string[]): Result<PluginRead> => {
  const safe = paths.every((path) => safePublicFile(root, path));
  const publicFiles = safe ? Object.fromEntries(paths.map((path) => [path, fileDigest(join(root, path))])) : {};
  return safe ? success({ ...plugin, contentSource: { checksum: plugin.checksum, files: publicFiles }, checksum: sha256(stableJson({ sourceChecksum: plugin.checksum, publicFiles })) })
    : failure(readerDiagnostic("plugin.reference.unsafe", "A published content reference leaves the plugin or follows a symbolic link.", root));
};

export const NODE_PLUGIN_FACTS_IO: PluginFactsIo = Object.freeze({
  readJson: readJsonFromDisk,
  inspectPlugin: loadPluginRoot,
  readPlugin: readPluginFromDisk,
});

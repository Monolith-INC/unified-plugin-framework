import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { sha256 } from "@agent-plugins/compiler";
import { collect, fail, object, ok, type Result } from "@agent-plugins/project";
import type { DependencySource } from "./dependency-sources.js";
import type { PluginRootArg } from "./plugin-facts.js";
import { readJsonFromDisk, sortedNames } from "./plugin-reader.js";

export interface DistributionFile { readonly path: string; readonly sha256: string }
const invalid = (): Result<never> => fail("distribution-incomplete", "The bundled dependency distribution is missing, incomplete or modified.",
  "Reinstall a verified complete release; plugin repositories are never fetched by an installed distribution.");
const portable = (path: string): boolean => path.length > 0 && path.split("/").every((part) => part !== "" && part !== "." && part !== "..") && !path.includes("\\");

/** Boundary: inventory regular source files byte for byte; links cannot escape the packaged dependency root.
 * Both sides are real paths, so a root reached through a link (macOS `/var` is `/private/var`) still contains its own links. */
const linkDigest = (root: string, path: string): string => {
  const target = readlinkSync(join(root, path));
  const resolved = realpathSync(resolve(dirname(join(root, path)), target));
  return !isAbsolute(target) && !relative(realpathSync(root), resolved).startsWith("..")
    ? sha256(`link:${target}`) : "unsupported-link";
};
export const distributionFiles = (root: string, prefix = ""): readonly DistributionFile[] => sortedNames(readdirSync(join(root, prefix))).flatMap((name) => {
  const path = prefix === "" ? name : `${prefix}/${name}`;
  const stat = lstatSync(join(root, path));
  return stat.isDirectory() ? distributionFiles(root, path) : stat.isFile()
    ? [{ path, sha256: sha256(readFileSync(join(root, path))) }] : [{ path, sha256: stat.isSymbolicLink() ? linkDigest(root, path) : "unsupported-link" }];
});
const files = (value: unknown): value is readonly DistributionFile[] => Array.isArray(value) && value.every((file: unknown) =>
  object(file) && typeof file.path === "string" && portable(file.path) && typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256));
const sameFiles = (root: string, expected: readonly DistributionFile[]): boolean => {
  try { return JSON.stringify(distributionFiles(root)) === JSON.stringify(expected); }
  catch { return false; }
};
const bundledRoot = (root: string, plugins: readonly unknown[], mode: "verify" | "resolve") => (source: DependencySource): Result<PluginRootArg> => {
  const entry = plugins.find((value) => object(value) && value.plugin === source.plugin && value.version === source.version);
  const checkout = join(root, "dependencies", `${source.plugin}@${source.version}`);
  const path = join(checkout, source.path);
  return object(entry) && (mode === "resolve" || files(entry.files) && sameFiles(checkout, entry.files))
    ? ok({ name: source.plugin, version: source.version, path }) : invalid();
};

/** Installed releases fail closed; only a real development workspace may fall back to source fetching. */
export const bundledRoots = (root: string, sources: readonly DependencySource[], mode: "verify" | "resolve" = "verify"): Result<readonly PluginRootArg[]> | null => {
  const raw = readJsonFromDisk(join(root, "distribution.json"));
  return raw.kind === "absent" && existsSync(join(root, "pnpm-workspace.yaml")) && !existsSync(join(root, ".upf-distribution")) ? null
    : raw.kind !== "value" || !object(raw.value) || raw.value.format !== "upf-distribution/1" || !Array.isArray(raw.value.plugins) ? invalid()
      : collect(sources.map(bundledRoot(root, raw.value.plugins, mode)));
};

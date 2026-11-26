import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { claudeAdapter } from "@agent-plugins/adapter-claude";
import { codexAdapter } from "@agent-plugins/adapter-codex";
import { cursorAdapter } from "@agent-plugins/adapter-cursor";
import {
  finalizeVendorBundle,
  normalizeCanonicalPlugin,
  sha256,
} from "@agent-plugins/compiler";
import { createVendorInstaller, installVendorBundle } from "@agent-plugins/installer";
import { SHIPPED_PLUGINS, buildVendorBundle, repositoryShippedSources } from "@agent-plugins/workflows";
import { runInstallCommand } from "../dist/index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const helloWorldRoot = join(repositoryRoot, "fixtures", "plugins", "hello-world");
const vendors = [
  {
    adapter: claudeAdapter,
    manifestPath: ".claude-plugin/plugin.json",
    packageRoot: "packages/adapter-claude",
  },
  {
    adapter: codexAdapter,
    manifestPath: ".codex-plugin/plugin.json",
    packageRoot: "packages/adapter-codex",
  },
  {
    adapter: cursorAdapter,
    manifestPath: ".cursor-plugin/plugin.json",
    packageRoot: "packages/adapter-cursor",
  },
];

function snapshot(root, prefix = "") {
  if (!existsSync(root)) return [];
  return readdirSync(root).sort().flatMap((name) => {
    const absolute = join(root, name);
    const path = prefix === "" ? name : `${prefix}/${name}`;
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) return [{ path, kind: "directory", mode: stat.mode & 0o777 }, ...snapshot(absolute, path)];
    return [{ path, kind: "file", mode: stat.mode & 0o777, content: readFileSync(absolute).toString("base64") }];
  });
}

function compiledBundle(adapter, canonical, version) {
  const draft = adapter.compile({
    ...canonical,
    manifest: { ...canonical.manifest, version },
    sourceDigest: sha256(`${adapter.vendor}:${version}`),
  });
  assert.equal(draft.ok, true);
  const bundle = finalizeVendorBundle(draft.value);
  assert.equal(bundle.ok, true);
  return bundle.value;
}

async function capture(operation) {
  const stdout = [];
  const stderr = [];
  const priorLog = console.log;
  const priorError = console.error;
  console.log = (value) => stdout.push(String(value));
  console.error = (value) => stderr.push(String(value));
  try {
    const code = await operation();
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally { console.log = priorLog; console.error = priorError; }
}

function markdownFiles(root) {
  return readdirSync(root).sort().flatMap((name) => {
    const absolute = join(root, name);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) return markdownFiles(absolute);
    return name.endsWith(".md") ? [absolute] : [];
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("every vendor supports install, unchanged reinstall, upgrade, compatible older install, rejected incompatible downgrade, and failed-upgrade rollback", () => {
  const canonical = normalizeCanonicalPlugin(helloWorldRoot);
  assert.equal(canonical.ok, true);

  for (const { adapter } of vendors) {
    const loaded = buildVendorBundle(helloWorldRoot, adapter);
    assert.equal(loaded.ok, true);
    const target = mkdtempSync(join(tmpdir(), `release-${adapter.vendor}-`));
    writeFileSync(join(target, "unrelated.txt"), "preserve me\n");

    const installed = installVendorBundle({ bundle: loaded.value, adapter, target: { root: target } });
    assert.equal(installed.kind, "installed", adapter.vendor);
    assert.equal(installVendorBundle({ bundle: loaded.value, adapter, target: { root: target } }).kind, "unchanged", adapter.vendor);

    const upgraded = compiledBundle(adapter, canonical.value, "2.0.0");
    assert.equal(installVendorBundle({ bundle: upgraded, adapter, target: { root: target } }).kind, "installed", adapter.vendor);

    const older = installVendorBundle({ bundle: loaded.value, adapter, target: { root: target } });
    assert.equal(older.kind, "installed", `${adapter.vendor} compatible older bundle`);

    const incompatible = {
      ...loaded.value,
      manifest: {
        ...loaded.value.manifest,
        adapter: { ...loaded.value.manifest.adapter, version: "0.0.0" },
      },
    };
    const rejected = installVendorBundle({ bundle: incompatible, adapter, target: { root: target } });
    assert.equal(rejected.kind, "failed-before-mutation", `${adapter.vendor} incompatible downgrade`);
    assert.ok(rejected.diagnostics.some((entry) => entry.code === "install.preflight.adapter_mismatch"));

    const beforeFailedUpgrade = snapshot(target);
    const failingInstaller = createVendorInstaller({
      beforeMutation(point) {
        if (point.index === 1) throw new Error("injected release-evidence fault");
      },
    });
    const failed = failingInstaller({
      bundle: compiledBundle(adapter, canonical.value, "3.0.0"),
      adapter,
      target: { root: target },
    });
    assert.equal(failed.kind, "rolled-back", `${adapter.vendor} failed upgrade`);
    assert.deepEqual(snapshot(target), beforeFailedUpgrade, `${adapter.vendor} exact rollback`);
    assert.equal(readFileSync(join(target, "unrelated.txt"), "utf8"), "preserve me\n");
  }
});

test("the release install path has no compilation, execution or elevation, and its one network read is the asset download", () => {
  const source = (...path) => readFileSync(join(repositoryRoot, "packages", ...path), "utf8");
  const installer = source("installer", "src", "index.ts");
  const command = source("cli", "src", "index.ts");
  const download = source("cli", "src", "release-download.ts");
  const asset = source("cli", "src", "release-asset.ts");
  const forbidden = [
    /\b(?:compilePlugin|compileVendorPayload|normalizeCanonicalPlugin|verifyShippedPayload)\s*\(/u,
    /node:(?:child_process|http|https|net|tls|dns)/u,
    /\b(?:spawn|spawnSync|execFile|execFileSync|eval|setuid|setgid|chown|chownSync)\s*\(/u,
    /\b(?:sudo|doas)\b/u,
  ];
  const network = /\b(?:fetch|request|connect|createConnection)\s*\(/gu;
  for (const pattern of forbidden) [installer, command, download, asset].map((text) => assert.doesNotMatch(text, pattern));
  assert.doesNotMatch(`${installer}\n${command}\n${asset}`, network);
  assert.equal([...download.matchAll(network)].length, 1, "the release download makes exactly one kind of request: an HTTPS GET");
  assert.match(download, /DEFAULT_RELEASE_URL = "https:\/\/github\.com\//u);
});

test("release documentation describes release-asset installs and exercises the source install commands", async () => {
  const documentedFiles = [
    join(repositoryRoot, "README.md"),
    join(repositoryRoot, "CHANGELOG.md"),
    join(repositoryRoot, "docs", "vendor-payload-installation.md"),
    ...markdownFiles(join(repositoryRoot, "docs", "release-notes")),
  ];
  const documentation = documentedFiles.map((path) => readFileSync(path, "utf8")).join("\n");
  const forbiddenDocumentationModels = [
    /\bwire\b/iu,
    /post-install generation/iu,
    /dynamic artifact service/iu,
    /alternate install path/iu,
  ];
  for (const pattern of forbiddenDocumentationModels) assert.doesNotMatch(documentation, pattern);

  const commandPattern = /pnpm agent-plugin install --source (?<plugin>\.|plugins\/[a-z0-9-]+) --vendor (?<vendor>claude|cursor|codex) --target <target-directory>/gu;
  const commands = [...documentation.matchAll(commandPattern)].map((match) => match.groups);
  SHIPPED_PLUGINS.map((plugin) => {
    const sourceArg = plugin === "unified-plugin-framework" ? "." : `plugins/${plugin}`;
    return assert.deepEqual(
      new Set(commands.filter((command) => command.plugin === sourceArg).map((command) => command.vendor)),
      new Set(["claude", "codex", "cursor"]),
      `every host's install command is documented for ${plugin}`,
    );
  });

  for (const command of commands) {
    const target = mkdtempSync(join(tmpdir(), `docs-${command.vendor}-`));
    const result = await capture(() => runInstallCommand([
      "--source",
      join(repositoryRoot, command.plugin),
      "--vendor",
      command.vendor,
      "--target",
      target,
    ]));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).vendor, command.vendor);
  }

  const releaseCommand = /agent-plugin install (?<plugin>[a-z0-9-]+) --version <version> --vendor (?<vendor>claude|cursor|codex) --target <target-directory>/gu;
  const released = [...documentation.matchAll(releaseCommand)].map((match) => match.groups);
  assert.deepEqual(new Set(released.map((command) => command.plugin)), new Set(SHIPPED_PLUGINS), "docs list install commands only for shipped plugins");
  SHIPPED_PLUGINS.map((plugin) =>
    assert.deepEqual(
      new Set(released.filter((command) => command.plugin === plugin).map((command) => command.vendor)),
      new Set(["claude", "codex", "cursor"]),
      `every host's release install command is documented for ${plugin}`,
    ),
  );
  ["docs/workflows/code-review.md", "docs/workflows/discovery.md", "docs/workflows/project-tracking.md"].map((docPath) =>
    assert.doesNotMatch(readFileSync(join(repositoryRoot, docPath), "utf8"), /--framework plugins\/unified-plugin-framework/, `${docPath} uses root --framework .`),
  );
  assert.doesNotMatch(documentation, /packages\/adapter-[a-z]+\/payloads\/[a-z0-9-]+\/bundle\.json/u, "no document points at committed payloads");
  assert.match(readFileSync(join(repositoryRoot, ".gitignore"), "utf8"), /^packages\/adapter-\*\/payloads\/$/mu);

  for (const { adapter, packageRoot } of vendors) {
    const packageManifest = readJson(join(repositoryRoot, packageRoot, "package.json"));
    assert.ok(!packageManifest.files.includes("payloads"), `${adapter.vendor} package publishes no generated payloads`);
    assert.ok(packageManifest.files.includes("schema"), `${adapter.vendor} package publishes schema evidence`);
  }

  const shippedSources = repositoryShippedSources(repositoryRoot);
  const builtBundles = vendors.flatMap((vendor) => shippedSources.map((source) => ({ ...vendor, ...source })));
  for (const { adapter, manifestPath, plugin, root } of builtBundles) {
    const bundle = buildVendorBundle(root, adapter);
    assert.equal(bundle.ok, true, `${plugin} builds for ${adapter.vendor}`);
    assert.match(documentation, new RegExp(bundle.value.manifest.adapter.vendorSchemaVersion, "u"));
    const vendorManifest = JSON.parse(Buffer.from(bundle.value.files.find((file) => file.path === manifestPath).content).toString("utf8"));
    assert.equal(vendorManifest.sourceDigest, undefined);
    assert.equal(vendorManifest.payloadDigest, undefined);
    assert.equal(vendorManifest.adapter, undefined);
  }

  for (const path of [
    "AI_Codex/Features/age-13-vendor-payload-compiler-and-installer.md",
    "AI_Codex/Specs/age-13/design-doc.md",
    "AI_Codex/Specs/age-13/tech-spec.md",
    "AI_Codex/Specs/age-13/api-contract.md",
    "AI_Codex/Specs/age-13/implementation-plan.md",
  ]) {
    assert.ok(existsSync(join(repositoryRoot, path)), path);
    assert.match(documentation, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  for (const issue of ["AGE-13", "AGE-14", "AGE-15", "AGE-16", "AGE-17", "AGE-18", "AGE-19", "AGE-20", "AGE-21", "AGE-22", "AGE-23"]) {
    assert.match(documentation, new RegExp(`linear\\.app/agentical-monolithics/issue/${issue}`, "u"));
  }
  assert.match(documentation, /milestone-2087dd3f-72b8-433c-a2dc-144591aa64be/u);
});

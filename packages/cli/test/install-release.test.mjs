import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { claudeAdapter } from "@agent-plugins/adapter-claude";
import { codexAdapter } from "@agent-plugins/adapter-codex";
import { sha256 } from "@agent-plugins/compiler";
import { installVendorBundle } from "@agent-plugins/installer";
import { buildVendorBundle } from "@agent-plugins/workflows";
import { bundleResolver } from "../dist/bundle-source.js";
import { runInstallCommand } from "../dist/index.js";
import {
  packReleaseAsset,
  packReleaseSet,
  parseChecksums,
  releaseAssetName,
  releaseTag,
  renderChecksums,
  unpackReleaseAsset,
} from "../dist/release-asset.js";
import { downloadReleaseBundle, nodeFetchBytes } from "../dist/release-download.js";

const repo = resolve(import.meta.dirname, "../../..");
const helloWorld = join(repo, "plugins", "hello-world");
const BASE = "https://releases.example/download";

const built = (adapter) => {
  const bundle = buildVendorBundle(helloWorld, adapter);
  assert.equal(bundle.ok, true);
  return bundle.value;
};

/** A release served from memory: every request is recorded and missing URLs answer 404. */
const release = (tag, assets) => {
  const files = new Map([
    ...assets.map((asset) => [`${BASE}/${tag}/${asset.name}`, asset.bytes]),
    [`${BASE}/${tag}/SHA256SUMS`, Buffer.from(renderChecksums(assets))],
  ]);
  const requested = [];
  const fetchBytes = (url) => {
    requested.push(url);
    const bytes = files.get(url);
    return Promise.resolve(bytes === undefined
      ? { ok: false, diagnostics: [{ severity: "error", code: "cli.release.download", message: `HTTP 404 ${url}` }] }
      : { ok: true, value: new Uint8Array(bytes) });
  };
  return { fetchBytes, requested };
};

const codes = (result) => result.diagnostics.map(({ code }) => code);

const recordingIo = () => {
  const lines = { out: [], err: [] };
  return { lines, io: { out: (line) => lines.out.push(line), err: (line) => lines.err.push(line), cwd: () => repo } };
};

test("a packed bundle unpacks to the same bundle only under its published digest", () => {
  const bundle = built(claudeAdapter);
  const asset = packReleaseAsset(bundle);
  assert.equal(asset.name, "hello-world-claude.bundle.json.gz");
  const unpacked = unpackReleaseAsset(asset.bytes, sha256(asset.bytes));
  assert.equal(unpacked.ok, true);
  assert.deepEqual(unpacked.value.manifest, bundle.manifest);
  assert.deepEqual(unpacked.value.files.map((file) => [file.path, Buffer.from(file.content).toString()]), bundle.files.map((file) => [file.path, Buffer.from(file.content).toString()]));
  assert.ok(packReleaseAsset(bundle).bytes.equals(asset.bytes), "packing is deterministic");
  assert.deepEqual(codes(unpackReleaseAsset(asset.bytes, "0".repeat(64))), ["release.asset.digest_mismatch"]);
});

test("an archive whose files were altered, added or emptied is refused even when its outer digest is republished", () => {
  const bundle = built(claudeAdapter);
  const [first, ...rest] = bundle.files;
  const repack = (archive) => {
    const bytes = gzipSync(JSON.stringify(archive));
    return unpackReleaseAsset(bytes, sha256(bytes));
  };
  const altered = packReleaseAsset({ ...bundle, files: [{ ...first, content: new Uint8Array(Buffer.from("tampered\n")) }, ...rest] });
  assert.equal(unpackReleaseAsset(altered.bytes, sha256(altered.bytes)).ok, false);
  const contents = Object.fromEntries(bundle.files.map((file) => [file.path, Buffer.from(file.content).toString("base64")]));
  const format = "upf-vendor-bundle/1";
  assert.deepEqual(codes(repack({ format, manifest: bundle.manifest, contents: { ...contents, "extra.txt": "" } })), ["release.asset.contents"]);
  assert.deepEqual(codes(repack({ format, manifest: bundle.manifest, contents: { ...contents, [first.path]: 7 } })), ["release.asset.contents"]);
  assert.deepEqual(codes(repack({ format: "other/1", manifest: bundle.manifest, contents })), ["release.asset.unreadable"]);
  const garbage = gzipSync("not json");
  assert.deepEqual(codes(unpackReleaseAsset(garbage, sha256(garbage))), ["release.asset.unreadable"]);
});

test("a release set packs every bundle, lists every asset in SHA256SUMS, and fails when any bundle failed", () => {
  const set = packReleaseSet([{ ok: true, value: built(claudeAdapter) }, { ok: true, value: built(codexAdapter) }]);
  assert.equal(set.ok, true);
  assert.deepEqual(set.value.assets.map(({ name }) => name), ["hello-world-claude.bundle.json.gz", "hello-world-codex.bundle.json.gz"]);
  assert.deepEqual([...parseChecksums(set.value.checksums).keys()], ["hello-world-claude.bundle.json.gz", "hello-world-codex.bundle.json.gz"]);
  const failed = packReleaseSet([{ ok: true, value: built(claudeAdapter) }, { ok: false, diagnostics: [{ severity: "error", code: "x", message: "x" }] }]);
  assert.deepEqual(codes(failed), ["x"]);
  assert.deepEqual(packReleaseSet([]), { ok: true, value: { assets: [], checksums: "" } });
});

test("checksums render in sha256sum format and parse back; tags and asset names are stable", () => {
  const assets = [{ name: "b.gz", bytes: Buffer.from("b") }, { name: "a.gz", bytes: Buffer.from("a") }];
  const text = renderChecksums(assets);
  assert.equal(text, `${sha256(Buffer.from("b"))}  b.gz\n${sha256(Buffer.from("a"))}  a.gz\n`);
  assert.deepEqual([...parseChecksums(`${text}garbage line\n`)], [["b.gz", sha256(Buffer.from("b"))], ["a.gz", sha256(Buffer.from("a"))]]);
  assert.equal(releaseTag("0.2.0-rc.1"), "v0.2.0-rc.1");
  assert.equal(releaseTag("v0.2.0"), "v0.2.0");
  assert.equal(releaseAssetName("unified-plugin-framework", "codex"), "unified-plugin-framework-codex.bundle.json.gz");
});

test("a release download fetches the checksums, then the asset, and returns the verified bundle", async () => {
  const bundle = built(claudeAdapter);
  const served = release("v0.2.0-rc.1", [packReleaseAsset(bundle)]);
  const downloaded = await downloadReleaseBundle(served.fetchBytes, `${BASE}/`)({ plugin: "hello-world", version: "0.2.0-rc.1", vendor: "claude" });
  assert.equal(downloaded.ok, true);
  assert.equal(downloaded.value.manifest.payloadDigest, bundle.manifest.payloadDigest);
  assert.deepEqual(served.requested, [`${BASE}/v0.2.0-rc.1/SHA256SUMS`, `${BASE}/v0.2.0-rc.1/hello-world-claude.bundle.json.gz`]);
});

test("a release download refuses a missing asset, an asset for another host, a tampered asset, a missing release and a plain-HTTP base", async () => {
  const claude = packReleaseAsset(built(claudeAdapter));
  const request = { plugin: "hello-world", version: "v1.0.0", vendor: "codex" };
  assert.deepEqual(codes(await downloadReleaseBundle(release("v1.0.0", [claude]).fetchBytes, BASE)(request)), ["cli.release.asset_missing"]);

  const misnamed = { ...claude, name: "hello-world-codex.bundle.json.gz" };
  assert.deepEqual(codes(await downloadReleaseBundle(release("v1.0.0", [misnamed]).fetchBytes, BASE)(request)), ["cli.release.identity"]);

  const served = release("v1.0.0", [misnamed]);
  const tampering = (url) => served.fetchBytes(url).then((result) =>
    url.endsWith(".gz") && result.ok ? { ok: true, value: new Uint8Array([...result.value, 0]) } : result);
  assert.deepEqual(codes(await downloadReleaseBundle(tampering, BASE)(request)), ["release.asset.digest_mismatch"]);

  assert.deepEqual(codes(await downloadReleaseBundle(release("v9.9.9", []).fetchBytes, BASE)(request)), ["cli.release.download"]);

  const insecure = release("v1.0.0", [misnamed]);
  assert.deepEqual(codes(await downloadReleaseBundle(insecure.fetchBytes, "http://releases.example/download")(request)), ["cli.release.insecure"]);
  assert.deepEqual(insecure.requested, []);
});

test("nodeFetchBytes reports HTTP errors and a body cut off mid-download as download failures", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/missing") return response.writeHead(404).end();
    response.writeHead(200, { "content-length": "1000" });
    response.write("partial");
    return setTimeout(() => response.destroy(), 20);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  try {
    const missing = await nodeFetchBytes(`http://127.0.0.1:${port}/missing`);
    assert.deepEqual(codes(missing), ["cli.release.download"]);
    assert.match(missing.diagnostics[0].message, /HTTP 404/u);
    assert.deepEqual(codes(await nodeFetchBytes(`http://127.0.0.1:${port}/cut`)), ["cli.release.download"]);
    assert.deepEqual(codes(await nodeFetchBytes("http://127.0.0.1:1/unreachable")), ["cli.release.download"]);
  } finally {
    server.close();
  }
});

test("install --version runs the production resolver, installs the verified bundle, and writes nothing on a refused one", async () => {
  const served = release("v0.2.0", [packReleaseAsset(built(codexAdapter))]);
  const runtime = { resolve: bundleResolver(served.fetchBytes, BASE), install: installVendorBundle };
  const { lines, io } = recordingIo();

  const target = mkdtempSync(join(tmpdir(), "cli-release-codex-"));
  assert.equal(await runInstallCommand(["hello-world", "--version", "0.2.0", "--vendor", "codex", "--target", target], runtime, io), 0, lines.err.join("\n"));
  assert.equal(JSON.parse(lines.out[0]).vendor, "codex");
  assert.ok(readdirSync(target).includes(".codex-plugin"));

  const refused = mkdtempSync(join(tmpdir(), "cli-release-claude-"));
  assert.equal(await runInstallCommand(["hello-world", "--version", "0.2.0", "--vendor", "claude", "--target", refused], runtime, io), 3);
  assert.deepEqual(JSON.parse(lines.err.at(-1)).diagnostics.map(({ code }) => code), ["cli.release.asset_missing"]);
  assert.deepEqual(readdirSync(refused), []);
});

test("a release built by another adapter version is refused with a hint to match the CLI", async () => {
  const bundle = built(codexAdapter);
  const older = { ...bundle, manifest: { ...bundle.manifest, adapter: { ...bundle.manifest.adapter, version: "0.9.0" } } };
  const served = release("v0.2.0", [packReleaseAsset(older)]);
  const resolved = await bundleResolver(served.fetchBytes, BASE)({ kind: "release", plugin: "hello-world", version: "0.2.0", vendor: "codex" });
  assert.deepEqual(codes(resolved), ["cli.release.adapter_mismatch"]);
  assert.match(resolved.diagnostics[0].message, /upgrade the CLI/u);
});

test("a resolver that rejects is reported as an unexpected failure with exit 70, without its details", async () => {
  const { lines, io } = recordingIo();
  const runtime = { resolve: () => Promise.reject(new Error("secret details")), install: installVendorBundle };
  assert.equal(await runInstallCommand(["hello-world", "--version", "0.2.0", "--vendor", "codex", "--target", "/tmp"], runtime, io), 70);
  assert.doesNotMatch(lines.err.join("\n"), /secret details/u);
});

test("install takes exactly one mode and says which flag is missing", async () => {
  const { lines, io } = recordingIo();
  const cases = [
    [["hello-world", "--vendor", "claude", "--target", "/tmp", "--version", "latest"], "cli.arguments.version"],
    [["plugins/hello-world", "--vendor", "claude", "--target", "/tmp", "--version", "0.2.0"], "cli.arguments.plugin"],
    [["hello-world", "--vendor", "claude", "--target", "/tmp", "--version", "0.2.0", "--version", "0.3.0"], "cli.arguments.invalid"],
    [["hello-world", "--vendor", "claude", "--target", "/tmp"], "cli.arguments.mode"],
    [["hello-world", "--source", helloWorld, "--vendor", "claude", "--target", "/tmp", "--version", "0.2.0"], "cli.arguments.mode"],
    [["--vendor", "claude", "--target", "/tmp", "--version", "0.2.0"], "cli.arguments.mode"],
  ];
  for (const [argv] of cases) assert.equal(await runInstallCommand(argv, undefined, io), 2, argv.join(" "));
  assert.deepEqual(lines.err.map((line) => JSON.parse(line).diagnostics[0].code), cases.map(([, code]) => code));
  assert.match(lines.err[3], /Add --version <version> to install the released hello-world/u);
});

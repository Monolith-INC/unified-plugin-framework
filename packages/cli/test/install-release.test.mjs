import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { claudeAdapter } from "@agent-plugins/adapter-claude";
import { codexAdapter } from "@agent-plugins/adapter-codex";
import { sha256 } from "@agent-plugins/compiler";
import {
  buildVendorBundle,
  packReleaseAsset,
  parseChecksums,
  releaseAssetName,
  releaseTag,
  renderChecksums,
  unpackReleaseAsset,
} from "@agent-plugins/workflows";
import { runInstallCommand } from "../dist/index.js";
import { downloadReleaseBundle } from "../dist/release-download.js";

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
  const files = new Map([...assets.map((asset) => [`${BASE}/${tag}/${asset.name}`, asset.bytes]), [`${BASE}/${tag}/SHA256SUMS`, Buffer.from(renderChecksums(assets))]]);
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

test("a packed bundle unpacks to the same bundle only under its published digest", () => {
  const bundle = built(claudeAdapter);
  const asset = packReleaseAsset(bundle);
  assert.equal(asset.name, "hello-world-claude.bundle.json.gz");
  const unpacked = unpackReleaseAsset(asset.bytes, sha256(asset.bytes));
  assert.equal(unpacked.ok, true);
  assert.deepEqual(unpacked.value.manifest, bundle.manifest);
  assert.deepEqual(unpacked.value.files.map((file) => [file.path, Buffer.from(file.content).toString()]), bundle.files.map((file) => [file.path, Buffer.from(file.content).toString()]));
  assert.deepEqual(codes(unpackReleaseAsset(asset.bytes, "0".repeat(64))), ["release.asset.digest_mismatch"]);
});

test("an archive whose file was altered is refused even when its outer digest is republished", () => {
  const bundle = built(claudeAdapter);
  const [first, ...rest] = bundle.files;
  const altered = packReleaseAsset({ ...bundle, files: [{ ...first, content: new Uint8Array(Buffer.from("tampered\n")) }, ...rest] });
  const unpacked = unpackReleaseAsset(altered.bytes, sha256(altered.bytes));
  assert.equal(unpacked.ok, false);
  const garbage = gzipSync("not json");
  assert.deepEqual(codes(unpackReleaseAsset(garbage, sha256(garbage))), ["release.asset.unreadable"]);
});

test("checksums render in sha256sum format and parse back; tags and asset names are stable", () => {
  const assets = [{ name: "b.gz", bytes: Buffer.from("b") }, { name: "a.gz", bytes: Buffer.from("a") }];
  const text = renderChecksums(assets);
  assert.equal(text, `${sha256(Buffer.from("b"))}  b.gz\n${sha256(Buffer.from("a"))}  a.gz\n`);
  assert.deepEqual([...parseChecksums(`${text}garbage line\n`)], [["b.gz", sha256(Buffer.from("b"))], ["a.gz", sha256(Buffer.from("a"))]]);
  assert.equal(renderChecksums([]), "");
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

test("a release download refuses a missing asset, a tampered asset, and an asset for another host", async () => {
  const claude = packReleaseAsset(built(claudeAdapter));
  const request = { plugin: "hello-world", version: "v1.0.0", vendor: "codex" };
  const missing = await downloadReleaseBundle(release("v1.0.0", [claude]).fetchBytes, BASE)(request);
  assert.deepEqual(codes(missing), ["cli.release.asset_missing"]);

  const misnamed = await downloadReleaseBundle(release("v1.0.0", [{ ...claude, name: "hello-world-codex.bundle.json.gz" }]).fetchBytes, BASE)(request);
  assert.deepEqual(codes(misnamed), ["cli.release.identity"]);

  const tamperedServer = release("v1.0.0", [{ ...claude, name: "hello-world-codex.bundle.json.gz" }]);
  const tampered = await downloadReleaseBundle((url) => tamperedServer.fetchBytes(url).then((result) =>
    url.endsWith(".gz") && result.ok ? { ok: true, value: new Uint8Array([...result.value, 0]) } : result), BASE)(request);
  assert.deepEqual(codes(tampered), ["release.asset.digest_mismatch"]);

  const absent = await downloadReleaseBundle(release("v9.9.9", []).fetchBytes, BASE)(request);
  assert.deepEqual(codes(absent), ["cli.release.download"]);
});

test("install --version takes the release path, installs the downloaded bundle, and writes nothing on a refused one", async () => {
  const served = release("v0.2.0", [packReleaseAsset(built(codexAdapter))]);
  const runtime = {
    resolve: (source) => {
      assert.deepEqual(source, { kind: "release", plugin: "hello-world", version: "0.2.0", vendor: source.vendor });
      return downloadReleaseBundle(served.fetchBytes, BASE)(source).then((bundle) => bundle.ok ? { ok: true, value: { bundle: bundle.value, adapter: codexAdapter } } : bundle);
    },
    install: (await import("@agent-plugins/installer")).installVendorBundle,
  };
  const lines = { out: [], err: [] };
  const io = { out: (line) => lines.out.push(line), err: (line) => lines.err.push(line), cwd: () => repo };

  const target = mkdtempSync(join(tmpdir(), "cli-release-codex-"));
  assert.equal(await runInstallCommand(["hello-world", "--vendor", "codex", "--target", target, "--version", "0.2.0"], runtime, io), 0, lines.err.join("\n"));
  assert.equal(JSON.parse(lines.out[0]).vendor, "codex");
  assert.ok(readdirSync(target).includes(".codex-plugin"));

  const refused = mkdtempSync(join(tmpdir(), "cli-release-claude-"));
  assert.equal(await runInstallCommand(["hello-world", "--vendor", "claude", "--target", refused, "--version", "0.2.0"], runtime, io), 3);
  assert.deepEqual(JSON.parse(lines.err.at(-1)).diagnostics.map(({ code }) => code), ["cli.release.asset_missing"]);
  assert.deepEqual(readdirSync(refused), []);
});

test("install --version rejects a malformed version and a path in place of a released plugin name", () => {
  const lines = [];
  const io = { out: () => undefined, err: (line) => lines.push(line), cwd: () => repo };
  assert.equal(runInstallCommand(["hello-world", "--vendor", "claude", "--target", "/tmp", "--version", "latest"], undefined, io), 2);
  assert.equal(runInstallCommand(["plugins/hello-world", "--vendor", "claude", "--target", "/tmp", "--version", "0.2.0"], undefined, io), 2);
  assert.equal(runInstallCommand(["hello-world", "--vendor", "claude", "--target", "/tmp", "--version", "0.2.0", "--version", "0.3.0"], undefined, io), 2);
  assert.deepEqual(lines.map((line) => JSON.parse(line).diagnostics[0].code), ["cli.arguments.version", "cli.arguments.plugin", "cli.arguments.invalid"]);
});

---
type: spec
kind: tech-spec
ticket: AGE-13
status: accepted
milestone: M4 — Vendor Payload Compiler & Transactional Installer
---

# Tech Spec: Vendor Payload Compiler and Transactional Installer

## Overview

Implement a release-time compiler that converts one validated canonical plugin into complete, deterministic Claude, Cursor, and Codex bundles through three required adapters. Each adapter package owns its vendor schemas, transformations, validation rules, install-plan logic, and generated payload. Add one common installer that consumes an already-built bundle and applies it through a staged, journaled transaction exposed only as `agent-plugin install`.

The implementation extends the monorepo without changing the responsibility of `@agent-plugins/core`. Core remains the portable loader and validator. Compiler, adapters, installer, and CLI compose outside that boundary.

The milestone has exactly one installation path. Compilation is a build/release command used to create shipped payloads; it is never invoked by installation. The installed payload contains everything its vendor needs. There is no wire, activation, repair, bootstrap, post-install generation, dynamic artifact resolution, or native-vendor alternative in this contract.

## Data Model

### Branded identifiers

```ts
type VendorId = "claude" | "cursor" | "codex";
type BundleSchemaVersion = "1.0.0";
type Sha256 = string & { readonly __brand: "Sha256" };
type RelativePayloadPath = string & { readonly __brand: "RelativePayloadPath" };
type PortableFileMode = 0o644 | 0o755;
```

Construction functions MUST validate branded values. A `Sha256` is 64 lowercase hexadecimal characters. A `RelativePayloadPath` is normalized UTF-8 text using `/`, contains at least one segment, and contains no absolute prefix, `.` segment, `..` segment, empty segment, NUL, or backslash.

### Canonical plugin

```ts
interface CanonicalPlugin {
  readonly root: string;
  readonly manifest: PluginManifest;
  readonly skills: readonly CanonicalSkill[];
  readonly mcpServers: readonly PluginMcpServer[];
  readonly rules: readonly CanonicalRule[];
  readonly hookIntents: readonly CanonicalHookIntent[];
  readonly distribution: CanonicalDistribution;
  readonly sourceDigest: Sha256;
}
```

`CanonicalPlugin` is constructed only after portable inspection contains no error diagnostic. Rules and hook intents express purpose and portable parameters; their types MUST NOT contain Claude, Cursor, or Codex field names, paths, event casing, or matchers. The compiler MUST reject canonical constructs that the selected adapter cannot represent instead of silently dropping them.

### Vendor adapter

```ts
interface VendorAdapter {
  readonly vendor: VendorId;
  readonly adapterVersion: string;
  readonly vendorSchemaVersion: string;
  readonly compile: (plugin: CanonicalPlugin) => Result<VendorBundleDraft>;
  readonly validate: (bundle: VendorBundle) => readonly Diagnostic[];
  readonly planInstallation: (
    bundle: VendorBundle,
    target: InstallTarget,
  ) => Result<InstallPlan>;
}
```

`Result<T>` contains either a value or a non-empty diagnostic list. Expected validation and mapping failures MUST NOT throw. The registry is a frozen record with exactly the three `VendorId` keys and MUST reject duplicate or missing adapters during composition-root initialization.

### Payload file

```ts
interface PayloadFile {
  readonly path: RelativePayloadPath;
  readonly content: Uint8Array;
  readonly sha256: Sha256;
  readonly bytes: number;
  readonly mode: PortableFileMode;
}
```

Files are sorted by normalized path. Duplicate paths are invalid. Text renderers MUST emit UTF-8 without a byte-order mark, LF line endings, and one terminal newline. JSON MUST use two-space indentation and stable lexical key ordering. Build timestamps MUST NOT enter file content or digests.

### Vendor bundle

```ts
interface VendorBundleManifest {
  readonly schemaVersion: BundleSchemaVersion;
  readonly plugin: {
    readonly name: string;
    readonly version: string;
  };
  readonly vendor: VendorId;
  readonly adapter: {
    readonly version: string;
    readonly vendorSchemaVersion: string;
  };
  readonly sourceDigest: Sha256;
  readonly payloadDigest: Sha256;
  readonly files: readonly Omit<PayloadFile, "content">[];
}

interface VendorBundle {
  readonly manifest: VendorBundleManifest;
  readonly files: readonly PayloadFile[];
}
```

`payloadDigest` is SHA-256 over a canonical encoding of every file path, mode, byte length, and content digest in lexical path order. Provenance remains in `VendorBundleManifest`; it MUST NOT be added to vendor-owned JSON objects unless the vendor schema explicitly defines a suitable field.

### Install target and plan

```ts
interface InstallTarget {
  readonly root: string;
}

interface InstallWrite {
  readonly source: RelativePayloadPath;
  readonly destination: RelativePayloadPath;
  readonly mode: PortableFileMode;
}

interface InstallPlan {
  readonly plugin: string;
  readonly version: string;
  readonly vendor: VendorId;
  readonly bundleDigest: Sha256;
  readonly writes: readonly InstallWrite[];
}
```

Every payload file MUST appear exactly once in `writes`, and every `source` MUST exist in the bundle. Destinations MUST be unique, normalized, target-relative, and lexically ordered. An adapter MAY change relative destination layout but MUST NOT include an absolute path or select a target outside `InstallTarget.root`.

### Installed record and journal

```ts
interface InstalledBundleRecord {
  readonly schemaVersion: "1.0.0";
  readonly plugin: string;
  readonly version: string;
  readonly vendor: VendorId;
  readonly adapterVersion: string;
  readonly sourceDigest: Sha256;
  readonly payloadDigest: Sha256;
  readonly installedFiles: readonly {
    readonly path: RelativePayloadPath;
    readonly sha256: Sha256;
    readonly mode: PortableFileMode;
  }[];
}

type JournalEntry =
  | { readonly kind: "created"; readonly path: RelativePayloadPath }
  | {
      readonly kind: "replaced";
      readonly path: RelativePayloadPath;
      readonly backupPath: RelativePayloadPath;
      readonly priorSha256: Sha256;
      readonly priorMode: PortableFileMode;
    }
  | {
      readonly kind: "removed";
      readonly path: RelativePayloadPath;
      readonly backupPath: RelativePayloadPath;
      readonly priorSha256: Sha256;
      readonly priorMode: PortableFileMode;
    };
```

The installed record is toolkit metadata stored under a reserved toolkit-owned directory inside the explicit target. The journal is written and durably flushed before each corresponding mutation. Journal and backup permissions MUST be user-only where the platform supports them. Exact prior state means presence or absence, bytes, and portable modes for every transaction-owned or mutated path, with unrelated paths preserved. The installer does not mutate ownership, access-control lists, extended attributes, or timestamps, so those attributes are outside portable rollback equality.

## API

### Compiler

```ts
compilePlugin(input: {
  readonly source: string;
  readonly vendor: VendorId;
  readonly output: string;
}): CompileResult

verifyShippedPayload(input: {
  readonly source: string;
  readonly vendor: VendorId;
  readonly shipped: string;
}): VerificationResult
```

`compilePlugin` validates source and adapter output before writing. It creates a sibling staging directory on the output filesystem, writes in lexical order, verifies staged bytes, and atomically replaces the prior output. Failure leaves the prior valid output unchanged and returns diagnostics.

`verifyShippedPayload` compiles into an isolated temporary directory and byte-compares manifests and files. Any missing, extra, modified, reordered, or mode-changed file returns a drift diagnostic.

### Adapter registry

```ts
getVendorAdapter(vendor: VendorId): VendorAdapter
listVendorAdapters(): readonly VendorId[]
```

The registry returns `claude`, `codex`, and `cursor` in lexical order. It has no default adapter. Unknown raw strings are rejected before lookup.

### Installer

```ts
installVendorBundle(input: {
  readonly bundle: VendorBundle;
  readonly adapter: VendorAdapter;
  readonly target: InstallTarget;
}): InstallResult
```

`InstallResult` is a closed union:

```ts
type InstallResult =
  | {
      readonly kind: "installed";
      readonly changedPaths: number;
      readonly record: InstalledBundleRecord;
    }
  | {
      readonly kind: "unchanged";
      readonly changedPaths: 0;
      readonly record: InstalledBundleRecord;
    }
  | {
      readonly kind: "failed-before-mutation";
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly kind: "rolled-back";
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly kind: "rollback-failed";
      readonly diagnostics: readonly Diagnostic[];
      readonly recoveryJournal: string;
    };
```

The installer validates that `adapter.vendor === bundle.manifest.vendor`, verifies all digests, obtains a plan, checks containment and collisions, and acquires a target lock before staging. It MUST NOT call `adapter.compile`.

### CLI

```text
agent-plugin install <plugin> --vendor <claude|cursor|codex> --target <directory>
```

The CLI resolves `<plugin>` to the shipped bundle for the required vendor. All three arguments are mandatory. Unknown options, duplicate options, extra positional arguments, missing payloads, and unsupported vendors fail before mutation. Successful output and failure envelopes are specified in `api-contract.md`.

## Implementation Plan

1. **AGE-14 — Contracts:** Add canonical, bundle, plan, record, and diagnostic types plus validation and package-boundary tests.
2. **AGE-15 — Adapter SDK:** Add the complete adapter interface, frozen three-vendor registry, conformance harness, and golden helpers.
3. **AGE-16 — Compiler:** Add canonical normalization, deterministic rendering materialization, provenance, atomic output replacement, shipped-payload packaging, and drift verification.
4. **AGE-17/18/19 — Required adapters:** Implement Cursor, Claude, and Codex schemas, renderers, validators, plans, and shipped reference payloads against the same harness.
5. **AGE-20 — Installer:** Implement preflight, lock, same-filesystem staging, backups, journal, commit, verification, idempotency, upgrades, and fault-injected rollback.
6. **AGE-21 — CLI:** Add strict command parsing, bundle resolution, JSON output, exit codes, and three-vendor integration coverage.
7. **AGE-22 — Release gates:** Add drift, security, cross-platform, and lifecycle suites and prohibit compiler/network fallback from the installation path.
8. **AGE-23 — Documentation and release:** Publish the one-path diagrams, authoring and adapter guides, recovery runbook, compatibility policy, changelog, and release.

Code ownership follows package boundaries. AGE-14 owns shared contracts; AGE-15 owns adapter conformance; AGE-16 owns compilation; AGE-17–19 own only their vendor directories; AGE-20 owns filesystem transactions; AGE-21 owns CLI composition; AGE-22 owns cross-boundary evidence; AGE-23 owns public handoff.

## Testing Strategy

### Unit tests

- Branded digest and path construction, including Unicode, separators, traversal, NUL, and duplicates.
- Canonical JSON/text formatting and payload digest vectors.
- Adapter mapping for every canonical component and every unsupported construct.
- Adapter validators against valid and invalid vendor fixtures.
- Install-plan completeness, uniqueness, ordering, and containment.
- Journal folds and rollback state transitions as pure values.

### Contract tests

The same suite MUST run against all three registered adapters and verify:

- identity matches registry key;
- schema and adapter versions are non-empty and pinned;
- compile returns a complete bundle or diagnostics;
- output is byte-identical over repeated runs;
- every output passes common and vendor validation;
- every file is planned exactly once;
- shipped payload matches regenerated output;
- no adapter performs filesystem writes during pure operations.

### Integration tests

- Build into an empty directory, replace a prior bundle, and inject failure before replacement.
- Install into an empty target, reinstall unchanged, upgrade, install an accepted older bundle, and reject an incompatible downgrade.
- Preserve unrelated files; reject owned-path collision and symlink escape.
- Inject failure before and after each mutation and compare every managed path byte-for-byte and mode-for-mode while proving unrelated paths remain unchanged.
- Simulate lock contention and stale-journal recovery.
- Run the CLI against Claude, Cursor, and Codex fixtures and assert stdout, stderr, exit code, installed record, and resulting tree.

### Acceptance tests

- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.
- Regenerate-and-diff produces an empty diff for every shipped payload.
- Vendor fixtures pass their pinned validators.
- A source or adapter change without regenerated payloads fails CI.
- Source inspection confirms the install path does not import or invoke compiler entrypoints and performs no network access.
- Documentation commands execute successfully against temporary targets.

## Rollback

Before M4 release, new packages and the unreleased `install` command can be removed without modifying core or the existing `validate`/`inspect` behavior. Every merge MUST keep existing package tests green.

After release, package consumers can pin the prior version. Shipped vendor payloads are restored only by rebuilding the desired tagged canonical source with its tagged adapter; direct payload repair is prohibited.

During installation, rollback is part of the transaction. A mutation failure replays the durable journal in reverse order, removes newly created files, restores replaced and removed files from backups, restores modes, and verifies prior digests. The lock is released only after successful verification or after preserving a failed recovery journal. A `rollback-failed` result MUST NOT claim that the original state was restored.

## Requirements (RFC 2119)

1. The system MUST maintain one canonical authored source for each plugin version.
2. M4 MUST register exactly one Claude, one Cursor, and one Codex adapter and MUST expose no fallback adapter.
3. Every vendor-specific schema, path, field, matcher, renderer, validator, and install-plan rule MUST live inside its adapter package.
4. Each adapter MUST ship the complete deterministic payload generated for its vendor and plugin version.
5. Generated payload files MUST NOT be manually edited and MUST be guarded by regenerate-and-diff CI.
6. The compiler MUST validate canonical input and adapter output before atomically replacing a shipped payload.
7. Identical canonical bytes, adapter version, vendor schema version, and toolchain version MUST produce byte-identical bundles.
8. `agent-plugin install` MUST be the only supported installation operation.
9. Installation MUST consume an already-built payload and MUST NOT invoke compilation, wiring, post-install generation, dynamic artifact lookup, or network fallback.
10. All vendors MUST use the same preflight, locking, staging, commit, verification, and rollback engine.
11. The installer MUST reject invalid digests, escaping paths, symlink escapes, duplicate destinations, insufficient permissions, and collisions before mutation.
12. A failed transaction MUST restore and verify the exact prior state or return `rollback-failed` with a preserved recovery journal.
13. Reinstalling an identical valid bundle MUST be idempotent.
14. Adapters MUST NOT mutate build or installation filesystems from their contract operations.
15. `@agent-plugins/core` MUST remain vendor-neutral and MUST NOT depend on compiler, adapters, installer, or CLI.
16. Compiler and installer paths MUST NOT execute plugin-controlled content or elevate privileges.
17. Public diagnostics and result unions MUST remain stable and machine-readable within the bundle schema major version.
18. Release MUST be blocked until all three adapters pass the shared conformance, drift, security, and transaction suites.

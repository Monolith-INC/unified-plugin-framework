---
type: spec
kind: api-contract
ticket: AGE-13
status: accepted
milestone: M4 — Vendor Payload Compiler & Transactional Installer
---

# API Contract: Vendor Compiler and Installer

## Endpoints

The feature exposes local TypeScript operations and one CLI installation command. It introduces no HTTP service.

### `compilePlugin`

```ts
compilePlugin(input: {
  readonly source: string;
  readonly vendor: VendorId;
  readonly output: string;
}): CompileResult;
```

Loads one canonical plugin root, selects one required adapter, produces a complete bundle, validates it, and atomically replaces the adapter-owned shipped output directory. This is a release/build API and is not reachable from installation.

### `verifyShippedPayload`

```ts
verifyShippedPayload(input: {
  readonly source: string;
  readonly vendor: VendorId;
  readonly shipped: string;
}): VerificationResult;
```

Regenerates the bundle in isolation and returns drift diagnostics for missing, extra, modified, reordered, or mode-changed files.

### `getVendorAdapter`

```ts
getVendorAdapter(vendor: VendorId): VendorAdapter;
```

Returns the single statically registered adapter for `claude`, `cursor`, or `codex`. Raw strings MUST be refined to `VendorId` before this operation. No default exists.

### `installVendorBundle`

```ts
installVendorBundle(input: {
  readonly bundle: VendorBundle;
  readonly adapter: VendorAdapter;
  readonly target: InstallTarget;
}): InstallResult;
```

Verifies and installs one complete bundle using the common transaction engine. The adapter supplies a relative plan but cannot mutate the target.

### CLI endpoint

```text
agent-plugin install <plugin> --vendor <claude|cursor|codex> --target <directory>
```

| Input | Required | Meaning |
| --- | --- | --- |
| `<plugin>` | Yes | Canonical plugin distribution containing shipped adapter payloads. |
| `--vendor` | Yes | Exact closed vendor identifier. |
| `--target` | Yes | Explicit installation root; resolved before preflight. |

There are no optional installation flags and no environment-variable fallback for these values. Existing global and command help behavior remains available, but help does not install.

## Schemas

### Bundle manifest JSON

```json
{
  "schemaVersion": "1.0.0",
  "plugin": {
    "name": "hello-world",
    "version": "1.0.0"
  },
  "vendor": "claude",
  "adapter": {
    "version": "1.0.0",
    "vendorSchemaVersion": "2026-08-10"
  },
  "sourceDigest": "0000000000000000000000000000000000000000000000000000000000000000",
  "payloadDigest": "1111111111111111111111111111111111111111111111111111111111111111",
  "files": [
    {
      "path": "relative/vendor/file",
      "sha256": "2222222222222222222222222222222222222222222222222222222222222222",
      "bytes": 128,
      "mode": 420
    }
  ]
}
```

The manifest has a closed field set. `mode` is the decimal JSON representation of portable `0o644` (`420`) or `0o755` (`493`). Files are ordered lexically by normalized path. File bytes are stored beneath the bundle payload root rather than encoded in the manifest.

### Compile result

```ts
type CompileResult =
  | {
      readonly ok: true;
      readonly bundle: VendorBundleManifest;
      readonly output: string;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
    };
```

### Verification result

```ts
type VerificationResult =
  | {
      readonly ok: true;
      readonly sourceDigest: Sha256;
      readonly payloadDigest: Sha256;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
    };
```

### CLI success output

Installed:

```json
{
  "ok": true,
  "outcome": "installed",
  "plugin": "hello-world",
  "version": "1.0.0",
  "vendor": "claude",
  "adapterVersion": "1.0.0",
  "payloadDigest": "1111111111111111111111111111111111111111111111111111111111111111",
  "target": "/resolved/target",
  "changedPaths": 6
}
```

Idempotent reinstall changes only `outcome` and `changedPaths`:

```json
{
  "ok": true,
  "outcome": "unchanged",
  "plugin": "hello-world",
  "version": "1.0.0",
  "vendor": "claude",
  "adapterVersion": "1.0.0",
  "payloadDigest": "1111111111111111111111111111111111111111111111111111111111111111",
  "target": "/resolved/target",
  "changedPaths": 0
}
```

### CLI failure output

```json
{
  "ok": false,
  "outcome": "rolled-back",
  "diagnostics": [
    {
      "severity": "error",
      "code": "install.commit.failed",
      "message": "Installation commit failed; prior target state was restored.",
      "path": "relative/vendor/file"
    }
  ]
}
```

`outcome` is one of `failed-before-mutation`, `rolled-back`, or `rollback-failed`. Only `rollback-failed` includes `recoveryJournal`, which is a resolved local path.

### Diagnostic families

| Family | Responsibility |
| --- | --- |
| `canonical.*` | Canonical source normalization beyond existing portable diagnostics. |
| `adapter.*` | Registry, unsupported mapping, and adapter contract failures. |
| `bundle.*` | Schema, path, digest, file, and drift failures. |
| `install.preflight.*` | Target, permission, collision, containment, and installed-version failures. |
| `install.lock.*` | Lock acquisition and stale-lock failures. |
| `install.stage.*` | Staging and staged-validation failures. |
| `install.commit.*` | Target mutation and post-commit verification failures. |
| `install.rollback.*` | Restoration and recovery-journal failures. |

Automation MUST use `code`, `severity`, and `outcome`; English messages are not stable identifiers.

## Error Handling

Expected invalid input and operating conditions are returned as typed results and diagnostics. The compiler and installer MUST NOT throw for invalid canonical input, unknown vendor text, unsupported mapping, bundle drift, digest mismatch, path rejection, collision, permission preflight, lock contention, or ordinary filesystem mutation failure.

CLI streams and exits:

| Result | Stdout | Stderr | Exit |
| --- | --- | --- | --- |
| Installed or unchanged | One compact JSON success object | Empty | `0` |
| Argument or help request | Usage for help; empty for argument failure | JSON diagnostics for argument failure | `0` help, `2` invalid arguments |
| Failed before mutation | Empty | One JSON failure object | `3` |
| Rolled back successfully | Empty | One JSON failure object | `4` |
| Rollback failed | Empty | One JSON failure object with recovery journal | `5` |
| Unexpected platform failure | Empty | One sanitized JSON failure object | `70` |

Diagnostics MUST NOT contain payload file contents, environment values, credentials, or backup contents. Unexpected errors are converted to a sanitized outer-boundary diagnostic; stack traces MAY be available only under the repository's development test harness, not normal CLI output.

## Versioning

- Package releases follow Semantic Versioning.
- `BundleSchemaVersion` versions common bundle structure independently from package and vendor schema versions.
- Each adapter pins the vendor schema snapshot it implements and publishes its own adapter version.
- Changing bundle field names, digest encoding, path normalization, installation-plan semantics, or result discriminators requires a bundle major version.
- Adding an optional diagnostic or a new diagnostic code is backward compatible; changing an existing code or outcome meaning is not.
- Changing adapter output for unchanged canonical input requires an adapter version change and regenerated shipped payload.
- A vendor schema change MUST be isolated to its adapter, MUST regenerate that adapter's payload, and MUST NOT change core portable behavior.
- Installer compatibility is determined before mutation from bundle schema, adapter identity, and installed-record versions.
- CLI command name, required arguments, JSON fields, streams, and exit codes are public interfaces.

## Requirements (RFC 2119)

1. `compilePlugin` MUST accept exactly one canonical source, one supported vendor, and one output directory.
2. `compilePlugin` MUST produce a complete valid bundle or diagnostics and MUST preserve the prior shipped output on failure.
3. `verifyShippedPayload` MUST compare regenerated and shipped payload bytes, modes, and paths without modifying the shipped payload.
4. The registry MUST contain exactly `claude`, `cursor`, and `codex` for bundle schema `1.0.0` and MUST NOT provide a fallback.
5. Every adapter MUST implement compile, validation, and installation-plan operations and MUST ship its generated payload.
6. Vendor adapters MUST return values and MUST NOT mutate compiler output or installation targets directly.
7. Bundle paths MUST be normalized, unique, relative, and contained; symlink payload entries MUST be rejected.
8. Payload and source digests MUST be verified before target mutation.
9. `agent-plugin install` MUST require plugin, vendor, and target inputs and MUST reject unknown or extra arguments.
10. `agent-plugin install` MUST be the only installation command and MUST NOT invoke compiler, wire, repair, activation, dynamic resolution, post-install generation, or network fallback.
11. All three vendors MUST use `installVendorBundle` and the same transaction algorithm.
12. Installation MUST acquire a target lock, stage completely, validate staging, journal backups, commit, and verify before reporting success.
13. On mutation failure, installation MUST restore the prior state or return `rollback-failed` with the preserved recovery-journal path.
14. An identical reinstall MUST return `unchanged` with zero changed paths.
15. CLI success MUST be emitted on stdout; failure MUST be emitted on stderr; both MUST be valid JSON.
16. Consumers SHOULD branch on result discriminators and diagnostic codes rather than message text.
17. Implementations MAY use platform-specific atomic primitives, but observable transaction and rollback guarantees MUST remain identical.

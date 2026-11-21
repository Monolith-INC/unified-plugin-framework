import assert from "node:assert/strict";
import test from "node:test";

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LEGACY_DISTRIBUTION_EXTENSION,
  MCP_SCHEMA_URL,
  PLUGIN_SCHEMA_URL,
  UPF_EXTENSION,
  diagnosticCodes,
  inspectManifest,
  inspectPlugin,
  loadPluginRoot,
} from "../dist/index.js";

const SCHEMA = { $schema: PLUGIN_SCHEMA_URL };

test("inspectManifest keeps valid v1.0.0 metadata (author, homepage, repository, license, keywords) and reports malformed ones", () => {
  const author = { name: "Monolith-INC", email: "dev@example.com", url: "https://github.com/Monolith-INC" };
  const valid = inspectManifest({
    ...SCHEMA,
    name: "acme.demo",
    author,
    homepage: "https://docs.example.com",
    repository: "https://github.com/Monolith-INC/demo",
    license: "Apache-2.0",
    keywords: ["portable", "skills"],
  });
  assert.deepEqual(valid.diagnostics, []);
  assert.deepEqual(valid.manifest, {
    ...SCHEMA,
    name: "acme.demo",
    author,
    homepage: "https://docs.example.com",
    repository: "https://github.com/Monolith-INC/demo",
    license: "Apache-2.0",
    keywords: ["portable", "skills"],
  });

  const codes = (manifest) =>
    inspectManifest({ ...SCHEMA, name: "demo", ...manifest }).diagnostics.map(({ code, path }) => [code, path]);
  [
    { author: "Monolith-INC" },
    { author: { name: "" } },
    { author: { name: "A", email: 1 } },
    { author: { name: "A", role: "x" } },
  ].map((manifest) =>
    assert.deepEqual(codes(manifest), [[diagnosticCodes.manifestAuthorInvalid, "author"]], JSON.stringify(manifest)),
  );
  assert.deepEqual(codes({ license: ["MIT"] }), [[diagnosticCodes.manifestLicenseInvalidType, "license"]]);
  assert.deepEqual(codes({ homepage: 123 }), [[diagnosticCodes.manifestHomepageInvalidType, "homepage"]]);
  assert.deepEqual(codes({ repository: false }), [[diagnosticCodes.manifestRepositoryInvalidType, "repository"]]);
  assert.deepEqual(codes({ keywords: "not-an-array" }), [[diagnosticCodes.manifestKeywordsInvalidType, "keywords"]]);
  assert.equal(inspectManifest({ ...SCHEMA, name: "demo", author: { name: "" } }).manifest, undefined);
});

test("inspectManifest reports structured manifest diagnostics", () => {
  const inspection = inspectManifest({
    version: 123,
    description: 42,
    extensions: [],
  });

  assert.equal(inspection.manifest, undefined);
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      path: diagnostic.path,
    })),
    [
      {
        severity: "error",
        code: diagnosticCodes.manifestSchemaRequired,
        path: "$schema",
      },
      {
        severity: "error",
        code: diagnosticCodes.manifestNameRequired,
        path: "name",
      },
      {
        severity: "error",
        code: diagnosticCodes.manifestVersionInvalidType,
        path: "version",
      },
      {
        severity: "error",
        code: diagnosticCodes.manifestDescriptionInvalidType,
        path: "description",
      },
      {
        severity: "warning",
        code: diagnosticCodes.manifestExtensionsInvalidType,
        path: "extensions",
      },
    ],
  );
});

test("inspectPlugin returns partial component data alongside diagnostics", () => {
  const inspection = inspectPlugin({
    ...SCHEMA,
    name: "partial-plugin",
    version: "1.0.0",
    skills: [
      {
        name: "hello-world",
        path: "skills/hello-world/SKILL.md",
      },
      {
        name: "missing-path",
      },
      "invalid-skill",
    ],
    mcpServers: [
      {
        name: "valid-server",
        type: "stdio",
        command: "node",
        args: ["server.js"],
      },
      {
        name: "missing-command",
        type: "stdio",
      },
      {
        name: "invalid-args",
        type: "stdio",
        command: "node",
        args: ["server.js", 42],
      },
    ],
  });

  assert.deepEqual(inspection.manifest, {
    ...SCHEMA,
    name: "partial-plugin",
    version: "1.0.0",
  });
  assert.deepEqual(inspection.skills, [
    {
      name: "hello-world",
      path: "skills/hello-world/SKILL.md",
    },
  ]);
  assert.deepEqual(inspection.mcpServers, [
    {
      transport: "stdio",
      name: "valid-server",
      command: "node",
      args: ["server.js"],
    },
  ]);
  assert.deepEqual(
    inspection.diagnostics.filter((d) => d.severity === "error").map((diagnostic) => diagnostic.code),
    [
      diagnosticCodes.skillPathRequired,
      diagnosticCodes.skillInvalidType,
      diagnosticCodes.mcpServerCommandRequired,
      diagnosticCodes.mcpServerArgInvalidType,
    ],
  );
  assert.ok(
    inspection.diagnostics.some(
      (d) => d.severity === "warning" && d.code === diagnosticCodes.manifestInlineComponentsLegacy,
    ),
  );
});

test("inspectPlugin accepts legacy path and object map component declarations with warnings", () => {
  const pathPlugin = inspectPlugin({
    ...SCHEMA,
    name: "path-plugin",
    version: "1.0.0",
    skills: "skills",
    mcpServers: "mcp.json",
  });
  assert.deepEqual(pathPlugin.manifest, { ...SCHEMA, name: "path-plugin", version: "1.0.0" });
  assert.deepEqual(pathPlugin.skills, [{ path: "skills" }]);
  assert.deepEqual(pathPlugin.mcpServers, [{ transport: "config-path", path: "mcp.json" }]);
  assert.equal(pathPlugin.diagnostics.some((d) => d.severity === "error"), false);
  assert.ok(pathPlugin.diagnostics.some((d) => d.code === diagnosticCodes.mcpLegacyFormat));

  const mapped = inspectPlugin({
    ...SCHEMA,
    name: "mapped-plugin",
    version: "1.0.0",
    mcpServers: {
      local: {
        command: "node",
        args: ["server.js"],
      },
      shared: "mcp/shared.json",
    },
  });
  assert.deepEqual(mapped.mcpServers, [
    {
      transport: "stdio",
      name: "local",
      command: "node",
      args: ["server.js"],
    },
    {
      transport: "config-path",
      name: "shared",
      path: "mcp/shared.json",
    },
  ]);
});

test("all stable diagnostic codes are reachable through inspection", () => {
  const inspections = [
    inspectPlugin(null),
    inspectPlugin({
      name: "",
      version: 123,
      description: 42,
      author: "nobody",
      homepage: 42,
      repository: 42,
      license: 42,
      keywords: 42,
      extensions: [],
      skills: 42,
      mcpServers: 42,
    }),
    inspectManifest({
      $schema: "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json",
      name: "future",
    }),
    inspectManifest({
      schemaVersion: "1.0.0",
      name: "@acme/legacy-name",
      extensions: { [LEGACY_DISTRIBUTION_EXTENSION]: {} },
    }),
    inspectPlugin({
      ...SCHEMA,
      name: "invalid-components",
      version: "1.0.0",
      skills: [
        null,
        {
          name: "",
          path: "",
          description: false,
        },
      ],
      mcpServers: [
        null,
        {
          name: "",
          type: "stdio",
          command: "",
          args: "invalid-args",
          env: 42,
          cwd: 42,
        },
        {
          name: "bad-stdio",
          type: "stdio",
          command: "${PLUGIN_ROOT}/bin/run",
          args: ["server.js", 42],
          env: { PLUGIN_ROOT: "/bad" },
          cwd: "relative-without-dot",
        },
        {
          name: "bad-transport",
          type: "websocket",
        },
        {
          name: "url-without-transport",
          url: "https://example.com/mcp",
        },
        {
          name: "sse-missing-url",
          transport: "sse",
        },
        {
          name: "bad-remote",
          type: "streamable-http",
          url: "http://example.com/mcp",
          headers: { "X-Dup": "1", "x-dup": "2" },
        },
        {
          name: "bad-headers-type",
          type: "streamable-http",
          url: "https://example.com/mcp",
          headers: "nope",
        },
        {
          name: "path-missing",
          transport: "config-path",
        },
      ],
    }),
    inspectManifest({
      ...SCHEMA,
      name: "Invalid_Name",
      version: "1.0.0",
      schemaVersion: "2.0.0",
      hooks: {},
    }),
    inspectManifest({
      ...SCHEMA,
      name: "typed-schema",
      version: "1.0.0",
      schemaVersion: 1,
    }),
    inspectManifest({
      ...SCHEMA,
      name: "malformed-onboarded-section",
      version: "1.0.0",
      extensions: { [UPF_EXTENSION]: [] },
    }),
    inspectManifest({
      ...SCHEMA,
      name: "invalid-onboarded-plugins",
      version: "1.0.0",
      extensions: {
        [UPF_EXTENSION]: {
          onboardedPlugins: [
            null,
            { name: "no-version", source: "github:example/no-version", adapter: "code-review" },
            { name: "unknown-adapter", version: "^1.0.0", source: "github:example/a", adapter: "unknown" },
            { name: "twice", version: "^1.0.0", source: "github:example/b", adapter: "code-review" },
            { name: "twice", version: "^1.0.0", source: "github:example/b", adapter: "code-review" },
          ],
        },
      },
    }),
  ];

  const root = mkdtempSync(join(tmpdir(), "agent-plugins-"));
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({ ...SCHEMA, name: "filesystem-codes", version: "1.0.0" }),
  );
  mkdirSync(join(root, "skills", "broken"), { recursive: true });
  writeFileSync(
    join(root, "mcp.json"),
    JSON.stringify({ $schema: "https://agent-plugins.org/schemas/9.0.0/mcp.schema.json", mcpServers: {} }),
  );
  const filesystemInspections = [loadPluginRoot(join(root, "missing-root")), loadPluginRoot(root)];

  const emittedCodes = new Set(
    [...inspections, ...filesystemInspections].flatMap((inspection) =>
      inspection.diagnostics.map((diagnostic) => diagnostic.code),
    ),
  );

  assert.deepEqual(
    emittedCodes,
    new Set(
      Object.values(diagnosticCodes).filter(
        (code) => !String(code).startsWith("path.") && !String(code).startsWith("authoring."),
      ),
    ),
  );
});

test("loadPluginRoot discovers skills and v1.0.0 mcp.json with zero diagnostics", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-hello-"));
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({
      ...SCHEMA,
      name: "hello-world",
      version: "1.0.0",
      description: "temp",
    }),
  );
  mkdirSync(join(root, "skills", "hello-world"), { recursive: true });
  writeFileSync(
    join(root, "skills", "hello-world", "SKILL.md"),
    "---\nname: hello-world\ndescription: greeting\n---\n\n# Hello\n",
  );
  writeFileSync(
    join(root, "mcp.json"),
    JSON.stringify({
      $schema: MCP_SCHEMA_URL,
      mcpServers: {
        docs: {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { CONFIG: "${PLUGIN_ROOT}/config.json" },
        },
      },
    }),
  );

  const inspection = loadPluginRoot(root);
  assert.deepEqual(inspection.manifest, {
    ...SCHEMA,
    name: "hello-world",
    version: "1.0.0",
    description: "temp",
  });
  assert.deepEqual(inspection.skills, [
    {
      name: "hello-world",
      path: "skills/hello-world/SKILL.md",
      description: "greeting",
    },
  ]);
  assert.deepEqual(inspection.mcpServers, [
    {
      transport: "stdio",
      name: "docs",
      command: "node",
      args: ["server.js"],
      env: { CONFIG: "${PLUGIN_ROOT}/config.json" },
      placeholders: ["PLUGIN_ROOT"],
    },
  ]);
  assert.deepEqual(inspection.diagnostics, []);
});

test("loadPluginRoot keeps discovered skills when manifest JSON is a non-object", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-null-manifest-"));
  writeFileSync(join(root, "plugin.json"), "null");
  mkdirSync(join(root, "skills", "hello"), { recursive: true });
  writeFileSync(
    join(root, "skills", "hello", "SKILL.md"),
    "---\nname: hello\ndescription: kept\n---\n\n# Hello\n",
  );

  const inspection = loadPluginRoot(root);
  assert.equal(inspection.manifest, undefined);
  assert.deepEqual(inspection.skills, [
    {
      name: "hello",
      path: "skills/hello/SKILL.md",
      description: "kept",
    },
  ]);
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.code),
    [diagnosticCodes.manifestInvalidType],
  );
});

test("loadPluginRoot reports unreadable for malformed plugin.json", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-bad-json-"));
  writeFileSync(join(root, "plugin.json"), "{");
  mkdirSync(join(root, "skills", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "hello", "SKILL.md"), "---\nname: hello\n---\n");

  const inspection = loadPluginRoot(root);
  assert.deepEqual(inspection.skills, [
    {
      name: "hello",
      path: "skills/hello/SKILL.md",
    },
  ]);
  assert.equal(inspection.diagnostics[0]?.code, diagnosticCodes.manifestUnreadable);
  assert.equal(inspection.diagnostics[0]?.message, "Plugin manifest could not be parsed as JSON.");
});

test("loadPluginRoot keeps discovered skills when plugin.json is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-missing-manifest-"));
  mkdirSync(join(root, "skills", "hello"), { recursive: true });
  writeFileSync(join(root, "skills", "hello", "SKILL.md"), "---\nname: hello\n---\n");

  const inspection = loadPluginRoot(root);
  assert.deepEqual(inspection.skills, [
    {
      name: "hello",
      path: "skills/hello/SKILL.md",
    },
  ]);
  assert.equal(inspection.diagnostics[0]?.code, diagnosticCodes.manifestUnreadable);
  assert.equal(inspection.diagnostics[0]?.message, "Plugin manifest could not be read.");
});

test("loadPluginRoot discovers only immediate skills deterministically and ignores nested skills", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-skill-discovery-"));
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({ ...SCHEMA, name: "skill-discovery", version: "1.0.0" }),
  );
  mkdirSync(join(root, "skills"), { recursive: true });
  writeFileSync(join(root, "skills", "README.md"), "ignored file\n");
  for (const [name, description] of [
    ["zeta", "third"],
    ["alpha", "first"],
    ["beta", "second"],
  ]) {
    mkdirSync(join(root, "skills", name), { recursive: true });
    writeFileSync(
      join(root, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    );
  }
  mkdirSync(join(root, "skills", "alpha", "nested-ignored"), { recursive: true });
  writeFileSync(
    join(root, "skills", "alpha", "nested-ignored", "SKILL.md"),
    "---\nname: nested-ignored\ndescription: must not be discovered\n---\n\n# Nested\n",
  );

  const inspection = loadPluginRoot(root);
  assert.deepEqual(
    inspection.skills.map((skill) => skill.path),
    ["skills/alpha/SKILL.md", "skills/beta/SKILL.md", "skills/zeta/SKILL.md"],
  );
  assert.equal(
    inspection.skills.some((skill) => skill.name === "nested-ignored"),
    false,
  );
  assert.deepEqual(inspection.diagnostics, []);
});

test("loadPluginRoot reports missing SKILL.md without executing skill content", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-missing-skill-md-"));
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({ ...SCHEMA, name: "missing-skill-md", version: "1.0.0" }),
  );
  mkdirSync(join(root, "skills", "broken"), { recursive: true });
  writeFileSync(join(root, "skills", "broken", "run.sh"), "#!/bin/sh\necho should-not-run\n");

  const inspection = loadPluginRoot(root);
  assert.equal(Object.hasOwn(inspection, "skills"), false);
  assert.deepEqual(inspection.diagnostics, [
    {
      severity: "error",
      code: diagnosticCodes.skillMissingSkillMd,
      message: "Skill directory must contain SKILL.md.",
      path: "skills/broken/SKILL.md",
    },
  ]);
});

test("inspectManifest enforces $schema, warns on unknown fields, and supports legacy schemaVersion", () => {
  const unsupportedSchema = inspectManifest({
    $schema: "https://agent-plugins.org/schemas/9.9.9/plugin.schema.json",
    name: "good-name",
  });
  assert.equal(unsupportedSchema.manifest, undefined);
  assert.ok(
    unsupportedSchema.diagnostics.some(
      (d) => d.code === diagnosticCodes.manifestSchemaUnsupported && d.message.includes(PLUGIN_SCHEMA_URL),
    ),
  );

  const unsupportedLegacy = inspectManifest({
    name: "good-name",
    schemaVersion: "9.9.9",
  });
  assert.equal(unsupportedLegacy.manifest, undefined);
  assert.ok(
    unsupportedLegacy.diagnostics.some((d) => d.code === diagnosticCodes.manifestSchemaVersionUnsupported),
  );

  const unknown = inspectManifest({
    ...SCHEMA,
    name: "good-name",
    hooks: true,
  });
  assert.deepEqual(unknown.manifest, { ...SCHEMA, name: "good-name" });
  assert.deepEqual(
    unknown.diagnostics.map(({ severity, code, path }) => ({ severity, code, path })),
    [{ severity: "warning", code: diagnosticCodes.manifestUnknownField, path: "hooks" }],
  );

  const invalidName = inspectManifest({
    ...SCHEMA,
    name: "Bad_Name",
  });
  assert.equal(invalidName.manifest, undefined);
  assert.ok(invalidName.diagnostics.some((d) => d.code === diagnosticCodes.manifestNameInvalid));

  const legacy = inspectManifest({
    name: "good-name",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    extensions: { "com.example": { flag: true } },
  });
  assert.deepEqual(legacy.manifest, {
    name: "good-name",
    version: "1.0.0",
    schemaVersion: "1.0.0",
    extensions: { "com.example": { flag: true } },
  });
  assert.deepEqual(
    legacy.diagnostics.map(({ severity, code }) => ({ severity, code })),
    [{ severity: "warning", code: diagnosticCodes.manifestSchemaLegacy }],
  );
});

test("loadPluginRoot models MCP transports, headers, env, and spec-accurate placeholders", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-mcp-transports-"));
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({ ...SCHEMA, name: "mcp-transports", version: "1.0.0" }),
  );
  writeFileSync(
    join(root, "mcp.json"),
    JSON.stringify({
      $schema: MCP_SCHEMA_URL,
      mcpServers: {
        local: {
          type: "stdio",
          command: "node",
          args: ["${PLUGIN_ROOT}/server.js"],
          env: { CACHE_DIR: "${PLUGIN_DATA}/cache" },
          cwd: "${PLUGIN_DATA}/runtime",
        },
        docs: {
          type: "streamable-http",
          url: "https://example.com/mcp",
          headers: { "X-Tenant": "public" },
        },
        events: {
          type: "sse",
          url: "http://localhost:8080/events",
        },
      },
    }),
  );

  const inspection = loadPluginRoot(root);
  assert.deepEqual(inspection.mcpServers, [
    {
      transport: "stdio",
      name: "local",
      command: "node",
      args: ["${PLUGIN_ROOT}/server.js"],
      env: { CACHE_DIR: "${PLUGIN_DATA}/cache" },
      cwd: "${PLUGIN_DATA}/runtime",
      placeholders: ["PLUGIN_DATA", "PLUGIN_ROOT"],
    },
    {
      transport: "streamable-http",
      name: "docs",
      url: "https://example.com/mcp",
      headers: { "X-Tenant": "public" },
    },
    {
      transport: "sse",
      name: "events",
      url: "http://localhost:8080/events",
    },
  ]);
  assert.deepEqual(inspection.diagnostics, []);
});

test("missing mcp.json remains valid", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-plugins-no-mcp-"));
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({ ...SCHEMA, name: "no-mcp", version: "1.0.0" }),
  );
  const inspection = loadPluginRoot(root);
  assert.equal(Object.hasOwn(inspection, "mcpServers"), false);
  assert.deepEqual(inspection.diagnostics, []);
});

test("MCP inference rejects ambiguous command+url and invalid cwd drops the server", () => {
  const ambiguous = inspectPlugin({
    ...SCHEMA,
    name: "ambiguous-mcp",
    version: "1.0.0",
    mcpServers: [
      {
        name: "both",
        command: "node",
        url: "https://example.com",
      },
      {
        name: "conflict",
        type: "stdio",
        transport: "sse",
        command: "node",
      },
      {
        name: "bad-cwd",
        type: "stdio",
        command: "node",
        cwd: 42,
      },
    ],
  });
  assert.equal(Object.hasOwn(ambiguous, "mcpServers"), false);
  assert.deepEqual(
    ambiguous.diagnostics.filter((d) => d.severity === "error").map((diagnostic) => diagnostic.code),
    [
      diagnosticCodes.mcpServerTransportRequired,
      diagnosticCodes.mcpServerTransportUnsupported,
      diagnosticCodes.mcpServerCwdInvalidType,
    ],
  );
});

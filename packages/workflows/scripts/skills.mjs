// Renders the framework's contract skills from the templates and the active adapters.
// `build` writes them; `verify` fails when a shipped skill drifted from its rendering.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORKFLOWS, renderSkill } from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = resolve(packageRoot, "../../plugins/unified-plugin-framework/skills");
const mode = process.argv[2];

const readOrEmpty = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

const results = Object.values(WORKFLOWS).flatMap((adapter) =>
  Object.keys(adapter.fulfil).map((operation) => {
    const template = readFileSync(join(packageRoot, "templates", adapter.workflow, `${operation}.md`), "utf8");
    const rendered = renderSkill(template, adapter, operation);
    const target = join(skillsRoot, operation, "SKILL.md");
    if (!rendered.ok) return { operation, ok: false, message: rendered.message };
    if (mode === "build") {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, rendered.text);
      return { operation, ok: true };
    }
    return readOrEmpty(target) === rendered.text
      ? { operation, ok: true }
      : { operation, ok: false, message: `${target} drifted from its template; run pnpm payloads:build.` };
  }),
);

const usage = mode === "build" || mode === "verify" ? [] : [{ ok: false, message: "Expected build or verify." }];
const report = { ok: [...results, ...usage].every((result) => result.ok), results: [...results, ...usage] };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;

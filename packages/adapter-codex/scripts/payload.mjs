import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { releasePayloads } from "@agent-plugins/workflows";

import { codexAdapter } from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reports = releasePayloads(process.argv[2] ?? "", codexAdapter, {
  pluginsRoot: resolve(packageRoot, "../../plugins"),
  payloadsRoot: join(packageRoot, "payloads"),
});

process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
if (reports.some(({ result }) => !result.ok)) process.exitCode = 1;

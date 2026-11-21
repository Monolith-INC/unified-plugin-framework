import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { releasePayloads, repositoryShippedSources, withPayloadsRoot } from "@agent-plugins/workflows";

import { cursorAdapter } from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operation = process.argv[2] ?? "";
// Verification writes to a scratch folder that is removed afterwards; only build keeps payloads in the package.
const reports = withPayloadsRoot(operation, join(packageRoot, "payloads"), (payloadsRoot) =>
  releasePayloads(operation, cursorAdapter, { sources: repositoryShippedSources(resolve(packageRoot, "../..")), payloadsRoot }),
);

process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
if (reports.some(({ result }) => !result.ok)) process.exitCode = 1;

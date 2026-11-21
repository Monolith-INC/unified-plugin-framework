import assert from "node:assert/strict";
import test from "node:test";

import { KNOWLEDGE_OPERATIONS, WORKFLOWS, knowledgeStoreAdapter } from "../dist/index.js";

test("knowledge workflow adapter maps all standalone monolithic-agent-knowledge-store skills", () => {
  assert.equal(WORKFLOWS.knowledge, knowledgeStoreAdapter);
  assert.equal(knowledgeStoreAdapter.workflow, "knowledge");
  for (const op of KNOWLEDGE_OPERATIONS) {
    assert.equal(knowledgeStoreAdapter.fulfil[op].length, 1);
    assert.equal(knowledgeStoreAdapter.fulfil[op][0].plugin, "monolithic-agent-knowledge-store");
  }
  assert.deepEqual(
    KNOWLEDGE_OPERATIONS.map((op) => knowledgeStoreAdapter.fulfil[op][0].skill),
    [
      "setup-project-knowledge",
      "discover-project-knowledge",
      "query-project-knowledge",
      "refresh-project-knowledge",
      "ingest-docs",
      "publish-docs",
    ],
  );
});

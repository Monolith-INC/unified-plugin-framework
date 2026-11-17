import assert from "node:assert/strict";
import test from "node:test";

import { andThen, andThenAsync, failureOf, fromDiagnostics, resultListMonoid, sequenceResults } from "../dist/railway.js";

const problem = (code) => ({ severity: "error", code, message: code });
const ok = (...values) => ({ ok: true, value: values });
const bad = (...codes) => ({ ok: false, diagnostics: codes.map(problem) });
const samples = [ok(), ok(1), ok(2, 3), bad("a"), bad("b", "c")];

test("the result-list monoid is associative and has a two-sided identity", () => {
  const { concat, empty } = resultListMonoid();
  samples.map((x) =>
    samples.map((y) =>
      samples.map((z) => assert.deepEqual(concat(concat(x, y), z), concat(x, concat(y, z)))),
    ),
  );
  samples.map((x) => {
    assert.deepEqual(concat(empty, x), x);
    assert.deepEqual(concat(x, empty), x);
    return x;
  });
});

test("sequenceResults keeps every value in order, or every diagnostic in order", () => {
  assert.deepEqual(sequenceResults([]), ok());
  assert.deepEqual(sequenceResults([{ ok: true, value: 1 }, { ok: true, value: 2 }]), ok(1, 2));
  assert.deepEqual(sequenceResults([bad("a"), { ok: true, value: 1 }, bad("b")]), bad("a", "b"));
});

test("andThen and andThenAsync run the next step only on success", async () => {
  assert.deepEqual(andThen({ ok: true, value: 2 }, (n) => ({ ok: true, value: n * 2 })), { ok: true, value: 4 });
  assert.deepEqual(andThen(bad("a"), () => assert.fail("must not run")), bad("a"));
  assert.deepEqual(await andThenAsync(Promise.resolve({ ok: true, value: 2 }), async (n) => ({ ok: true, value: n + 1 })), { ok: true, value: 3 });
  assert.deepEqual(await andThenAsync(Promise.resolve(bad("a")), () => assert.fail("must not run")), bad("a"));
});

test("failureOf and fromDiagnostics build failures from possibly empty lists", () => {
  assert.deepEqual(failureOf([], problem("fallback")), bad("fallback"));
  assert.deepEqual(failureOf([problem("a")], problem("fallback")), bad("a"));
  assert.deepEqual(fromDiagnostics([], 7), { ok: true, value: 7 });
  assert.deepEqual(fromDiagnostics([problem("a")], 7), bad("a"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimiter } from "./rate-limit.ts";

test("allows up to the limit in the window, then says how long to wait", () => {
  const l = createLimiter(2, 60_000);
  assert.equal(l.take("u", 0), null);
  assert.equal(l.take("u", 1_000), null);
  assert.equal(l.take("u", 2_000), 58);
  assert.equal(l.take("other", 2_000), null, "keys are counted separately");
});

test("old uses fall out of the window", () => {
  const l = createLimiter(1, 1_000);
  assert.equal(l.take("u", 0), null);
  assert.notEqual(l.take("u", 500), null);
  assert.equal(l.take("u", 1_001), null);
});

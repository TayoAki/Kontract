import assert from "node:assert/strict";
import { test } from "node:test";
import { addCost, meter, spentMicro } from "./cost-meter.ts";

test("costs add up inside a meter, across awaits", async () => {
  const { result, tally } = meter(async () => {
    addCost(1_000);
    await new Promise((r) => setTimeout(r, 5));
    addCost(2_500.4);
    return spentMicro();
  });
  assert.equal(await result, 3_500);
  assert.equal(tally.micro, 3_500);
});

test("outside a meter nothing is counted; meters don't leak into each other", async () => {
  addCost(99);
  assert.equal(spentMicro(), 0);
  const a = meter(async () => addCost(10));
  const b = meter(async () => addCost(20));
  await Promise.all([a.result, b.result]);
  assert.equal(a.tally.micro, 10);
  assert.equal(b.tally.micro, 20);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { apifyCostMicro, claudeCostMicro, claudePrice, firecrawlCostMicro, placesSearchCostMicro } from "./prices.ts";

test("Claude is billed from real usage: $/MTok is micro-dollars per token", () => {
  // Opus 5.5: $4 in, $20 out. 10,000 in + 2,000 out = $0.04 + $0.04 = 80,000 micro.
  assert.equal(claudeCostMicro("claude-opus-5-5", { input_tokens: 10_000, output_tokens: 2_000 }), 80_000);
  // Cache writes are 1.25x input; reads at the cache-read rate.
  assert.equal(claudeCostMicro("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 10_000 }), 5_000 + 2_000);
});

test("model ids match by family, longest first; unknown models bill high", () => {
  assert.equal(claudePrice("claude-opus-5-5").input, 4);
  assert.equal(claudePrice("claude-opus-5").input, 5);
  assert.equal(claudePrice("claude-opus-5-20260101").input, 5);
  assert.equal(claudePrice("claude-sonnet-5-5").input, 2);
  assert.equal(claudePrice("claude-fable-5-1").cacheRead, 0.25);
  assert.equal(claudePrice("claude-fable-5").cacheRead, 1);
  assert.equal(claudePrice("something-new").input, 10);
});

test("Haiku 5.5 long prompts cost more", () => {
  assert.equal(claudeCostMicro("claude-haiku-5-5", { input_tokens: 1_000, output_tokens: 1_000 }), Math.round(1_000 * 0.1 + 1_000 * 0.5));
  assert.equal(claudeCostMicro("claude-haiku-5-5", { input_tokens: 200_000, output_tokens: 1_000 }), 200_000 * 0.5 + 1_000 * 2.5);
});

test("per-call prices, with env overrides", () => {
  assert.equal(placesSearchCostMicro(), 35_000);
  assert.equal(apifyCostMicro(10), 7_000 + 40_000);
  assert.equal(firecrawlCostMicro(2), 2_000);
  process.env.FIRECRAWL_CREDIT_COST_MICRO = "5333";
  assert.equal(firecrawlCostMicro(3), 15_999);
  delete process.env.FIRECRAWL_CREDIT_COST_MICRO;
});

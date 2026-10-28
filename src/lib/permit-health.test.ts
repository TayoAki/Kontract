import assert from "node:assert/strict";
import { test } from "node:test";
import { feedHealth, healthWindow, type FeedCheck } from "./permit-health.ts";

const now = new Date("2026-10-28T15:00:00Z");
const check = (over: Partial<FeedCheck> = {}): FeedCheck => ({ checkedAt: "2026-10-28T12:00:00Z", days: 7, ok: true, rows: 900, latest: "2026-10-27", ms: 1200, ...over });

test("healthy, unknown and failing feeds", () => {
  assert.equal(feedHealth("daily", [], now).status, "unknown");
  const ok = feedHealth("daily", [check()], now);
  assert.equal(ok.status, "ok");
  assert.match(ok.detail, /900 permits in the last 7 days, newest 2026-10-27/);
  const failing = feedHealth("daily", [check({ ok: false, rows: 0, latest: null, error: "the city's portal timed out" }), check({ checkedAt: "2026-10-28T06:00:00Z" })], now);
  assert.equal(failing.status, "failing");
  assert.match(failing.detail, /timed out\. Last good pull 2026-10-28/);
});

test("a 200 with no rows is not healthy", () => {
  const h = feedHealth("daily", [check({ rows: 0, latest: null }), check({ rows: 850 }), check({ rows: 910 })], now);
  assert.equal(h.status, "empty");
  assert.match(h.detail, /usually has about 910/);
  assert.equal(feedHealth("daily", [check({ rows: 40 }), check({ rows: 850 }), check({ rows: 910 })], now).status, "empty", "a big drop counts too");
});

test("stale when the newest permit stops moving", () => {
  assert.equal(feedHealth("daily", [check({ latest: "2026-10-20" })], now).status, "stale");
  assert.equal(feedHealth("daily", [check({ latest: "2026-10-25" })], now).status, "ok", "a weekend is fine");
  assert.equal(healthWindow("weekly"), 30);
  assert.equal(feedHealth("weekly", [check({ days: 30, latest: "2026-10-21" })], now).status, "ok");
  assert.equal(feedHealth("weekly", [check({ days: 7 })], now).status, "unknown", "only same-window checks compare");
});

test("slow feeds say so", () => {
  assert.match(feedHealth("daily", [check({ ms: 31000 })], now).detail, /Slow: 31 s/);
});

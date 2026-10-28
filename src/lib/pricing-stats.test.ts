import assert from "node:assert/strict";
import { test } from "node:test";
import { annualize, awardYears, pricingStats, recipients } from "./pricing-stats.ts";
import type { PastAward } from "./types.ts";

const award = (p: Partial<PastAward>): PastAward => ({
  id: Math.random().toString(),
  awardId: "X",
  recipient: "ACME LLC",
  amount: 100_000,
  annualAmount: 100_000,
  agency: "Department of X",
  subAgency: "",
  startDate: "2022-01-01",
  endDate: "2023-01-01",
  years: 1,
  description: "",
  naics: null,
  psc: null,
  state: "CA",
  url: "",
  likelyRelated: false,
  ...p,
});

test("award length and annualizing", () => {
  assert.ok(Math.abs(awardYears("2021-09-01", "2026-08-31")! - 5) < 0.01);
  assert.equal(awardYears(null, "2026-01-01"), null);
  assert.equal(awardYears("2026-01-02", "2026-01-01"), null);
  assert.equal(annualize(1_000_000, 5), 200_000);
  assert.equal(annualize(50_000, 0.1), 50_000, "short jobs stay as one job");
  assert.equal(annualize(50_000, null), null);
});

test("median and middle-half range", () => {
  const s = pricingStats([10, 20, 30, 40, 50].map((n) => award({ amount: n, annualAmount: n })));
  assert.equal(s.count, 5);
  assert.equal(s.medianTotal, 30);
  assert.equal(s.lowTotal, 20);
  assert.equal(s.highTotal, 40);
  assert.equal(s.medianAnnual, 30);
  assert.equal(s.lowAnnual, 20);
  assert.equal(s.highAnnual, 40);
  assert.equal(s.annualCount, 5);
  assert.deepEqual(pricingStats([]), {
    count: 0,
    medianTotal: null,
    lowTotal: null,
    highTotal: null,
    medianAnnual: null,
    lowAnnual: null,
    highAnnual: null,
    annualCount: 0,
  });
});

test("per-year stats ignore short purchase orders when there are enough year-long awards", () => {
  const short = [1, 2, 3, 4, 5, 6].map((n) => award({ amount: n * 1000, annualAmount: n * 1000, years: 0.2 }));
  const long = [100, 200, 300].map((n) => award({ amount: n * 5000, annualAmount: n * 1000, years: 5 }));
  const s = pricingStats([...short, ...long]);
  assert.equal(s.annualCount, 3);
  assert.equal(s.medianAnnual, 200_000);
  // With fewer than three year-long awards, fall back to everything.
  assert.equal(pricingStats([...short, long[0]!]).annualCount, 7);
});

test("recipients groups winners and skips placeholders", () => {
  const r = recipients([
    award({ recipient: "Acme LLC", amount: 10, state: "CA", startDate: "2021-01-01" }),
    award({ recipient: "ACME LLC", amount: 30, state: "NV", startDate: "2024-01-01" }),
    award({ recipient: "Other Co", amount: 100 }),
    award({ recipient: "MULTIPLE RECIPIENTS", amount: 500 }),
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0]!.awards, 2);
  assert.equal(r[0]!.total, 40);
  assert.deepEqual(r[0]!.states, ["CA", "NV"]);
  assert.equal(r[0]!.latest, "2024-01-01");
});

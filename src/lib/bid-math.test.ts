import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMarkup, bidTotals, vsAnchor } from "./bid-math.ts";
import type { PricingModel } from "./types.ts";

// Hazardous-waste example: sub charges $700 per pickup, you charge $1,500,
// about 15 pickups a year, 5-year contract.
const waste: PricingModel = {
  periods: 5,
  periodLabel: "year",
  lines: [{ id: "a", description: "Pickup", unit: "pickup", quantity: 15, subCost: 700, price: 1500 }],
};

test("per-year and whole-contract totals", () => {
  const t = bidTotals(waste);
  assert.equal(t.subPerPeriod, 10_500);
  assert.equal(t.pricePerPeriod, 22_500);
  assert.equal(t.profitPerPeriod, 12_000);
  assert.equal(t.profitTotal, 60_000);
  assert.equal(t.priceTotal, 112_500);
  assert.ok(Math.abs(t.margin! - 12_000 / 22_500) < 1e-9);
});

test("multiple lines, one-time job (catering: per person, per meal)", () => {
  const meals: PricingModel = {
    periods: 1,
    periodLabel: "contract",
    lines: [
      { id: "b", description: "Breakfast", unit: "meal", quantity: 4200, subCost: 8, price: 10 },
      { id: "l", description: "Lunch", unit: "meal", quantity: 4200, subCost: 10, price: 12 },
      { id: "d", description: "Dinner", unit: "meal", quantity: 4200, subCost: 11, price: 15 },
    ],
  };
  const t = bidTotals(meals);
  assert.equal(t.subTotal, 4200 * 29);
  assert.equal(t.priceTotal, 4200 * 37);
  assert.equal(t.profitTotal, 4200 * 8);
});

test("empty model has no margin instead of dividing by zero", () => {
  const t = bidTotals({ periods: 0, periodLabel: "year", lines: [] });
  assert.equal(t.priceTotal, 0);
  assert.equal(t.margin, null);
  assert.equal(t.markup, null);
});

test("applyMarkup prices each line off its sub cost", () => {
  const m = applyMarkup(waste, 35);
  assert.equal(m.lines[0]!.price, 945);
  assert.equal(waste.lines[0]!.price, 1500, "original is not mutated");
});

test("vsAnchor compares per year for multi-year and total for one-off", () => {
  // Landscaping: previous contract $1.6M over 5 years, you bid $962k.
  const land: PricingModel = {
    periods: 5,
    periodLabel: "year",
    lines: [{ id: "x", description: "Grounds", unit: "month", quantity: 12, subCost: 700_000 / 60, price: 962_000 / 60 }],
    anchor: { annual: 1_600_000 / 5, total: 1_600_000, label: "previous contract" },
  };
  assert.ok(Math.abs(vsAnchor(land)! - (962_000 / 1_600_000 - 1)) < 1e-9);
  const oneOff: PricingModel = { ...land, periods: 1, periodLabel: "contract", anchor: { annual: null, total: 100_000, label: "x" } };
  assert.ok(Math.abs(vsAnchor(oneOff)! - (962_000 / 5 / 100_000 - 1)) < 1e-9);
  assert.equal(vsAnchor({ ...land, anchor: undefined }), null);
});

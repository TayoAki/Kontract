import type { PriceLine, PricingModel } from "./types.ts";

export interface BidTotals {
  /** Per period (usually per year). */
  subPerPeriod: number;
  pricePerPeriod: number;
  profitPerPeriod: number;
  /** Whole contract (all periods). */
  subTotal: number;
  priceTotal: number;
  profitTotal: number;
  /** Profit as a share of what you charge the government. */
  margin: number | null;
  /** How much you mark up the subcontractor's cost. */
  markup: number | null;
}

const lineSub = (l: PriceLine) => (l.quantity || 0) * (l.subCost || 0);
const linePrice = (l: PriceLine) => (l.quantity || 0) * (l.price || 0);

export function bidTotals(model: PricingModel): BidTotals {
  const periods = Math.max(1, model.periods || 1);
  const subPerPeriod = model.lines.reduce((s, l) => s + lineSub(l), 0);
  const pricePerPeriod = model.lines.reduce((s, l) => s + linePrice(l), 0);
  const profitPerPeriod = pricePerPeriod - subPerPeriod;
  return {
    subPerPeriod,
    pricePerPeriod,
    profitPerPeriod,
    subTotal: subPerPeriod * periods,
    priceTotal: pricePerPeriod * periods,
    profitTotal: profitPerPeriod * periods,
    margin: pricePerPeriod > 0 ? profitPerPeriod / pricePerPeriod : null,
    markup: subPerPeriod > 0 ? profitPerPeriod / subPerPeriod : null,
  };
}

/** Set every line's price to its sub cost plus `markupPct` percent, rounded to cents. */
export function applyMarkup(model: PricingModel, markupPct: number): PricingModel {
  return {
    ...model,
    lines: model.lines.map((l) => ({
      ...l,
      price: Math.round(l.subCost * (1 + markupPct / 100) * 100) / 100,
    })),
  };
}

/**
 * Compare your price with the past-award anchor: per year for multi-year
 * contracts, whole-contract otherwise. Returns e.g. -0.4 when you are 40% below.
 */
export function vsAnchor(model: PricingModel): number | null {
  const a = model.anchor;
  if (!a) return null;
  const t = bidTotals(model);
  if (model.periodLabel === "year" && a.annual && a.annual > 0 && t.pricePerPeriod > 0) {
    return t.pricePerPeriod / a.annual - 1;
  }
  if (a.total > 0 && t.priceTotal > 0) return t.priceTotal / a.total - 1;
  return null;
}

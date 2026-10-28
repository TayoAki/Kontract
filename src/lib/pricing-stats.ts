import type { PastAward, PricingStats } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Contract length in years from start/end dates, or null if unknown/implausible. */
export function awardYears(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / (365.25 * DAY_MS);
}

/** Annualized amount. Awards shorter than a year are left as-is (a one-off job isn't "per year"). */
export function annualize(amount: number, years: number | null): number | null {
  if (years == null) return null;
  return years >= 1 ? amount / years : amount;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const MIN_FOR_ANNUAL = 3;

export function pricingStats(awards: PastAward[]): PricingStats {
  const totals = awards.map((a) => a.amount).filter((n) => n > 0).sort((a, b) => a - b);
  // Short purchase orders aren't a yearly price; prefer awards that ran ~a year or more.
  const yearLong = awards.filter((a) => a.years != null && a.years >= 0.9);
  const basis = yearLong.length >= MIN_FOR_ANNUAL ? yearLong : awards;
  const annual = basis
    .map((a) => a.annualAmount)
    .filter((n): n is number => n != null && n > 0)
    .sort((a, b) => a - b);
  return {
    count: awards.length,
    medianTotal: quantile(totals, 0.5),
    lowTotal: quantile(totals, 0.25),
    highTotal: quantile(totals, 0.75),
    medianAnnual: quantile(annual, 0.5),
    lowAnnual: quantile(annual, 0.25),
    highAnnual: quantile(annual, 0.75),
    annualCount: annual.length,
  };
}

export interface RecipientSummary {
  name: string;
  awards: number;
  total: number;
  states: string[];
  latest: string | null;
}

/** Companies that already won similar work: possible subcontractors or teaming partners. */
export function recipients(awards: PastAward[]): RecipientSummary[] {
  const map = new Map<string, RecipientSummary>();
  for (const a of awards) {
    const key = a.recipient.trim().toUpperCase();
    if (!key || /MULTIPLE RECIPIENTS|REDACTED/.test(key)) continue;
    const r = map.get(key) ?? { name: a.recipient, awards: 0, total: 0, states: [], latest: null };
    r.awards += 1;
    r.total += a.amount;
    if (a.state && !r.states.includes(a.state)) r.states.push(a.state);
    if (a.startDate && (!r.latest || a.startDate > r.latest)) r.latest = a.startDate;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.awards - a.awards || b.total - a.total);
}

import { strengthRank } from "./permit-trades.ts";
import type { Permit, TradeId } from "./types.ts";

// Which permit leads a subscriber gets. Free: the 10 best of the last week,
// picked once per week. Daily: every lead, newest first.

/** Monday of the week containing `d`, as YYYY-MM-DD (UTC). */
export function weekStart(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

const DAY = 86400000;

/** Higher is better: how sure the tag is, then job size, then how fresh. */
export function leadScore(p: Permit, trade: TradeId, now: Date = new Date()): number {
  const tag = p.trades.find((t) => t.trade === trade);
  if (!tag) return -1;
  const sure = strengthRank(tag.strength) * 100;
  const size = p.value ? Math.min(60, Math.log10(p.value) * 10) : 20;
  const age = Math.max(0, (now.getTime() - Date.parse(`${p.issuedDate}T12:00:00Z`)) / DAY);
  const fresh = Math.max(0, 30 - age * 4);
  const home = p.residential === true ? 10 : 0;
  return sure + size + fresh + home;
}

export function leadsForTrade(permits: Permit[], trade: TradeId, zips?: string[]): Permit[] {
  const z = zips?.length ? new Set(zips) : null;
  return permits.filter((p) => p.trades.some((t) => t.trade === trade) && (!z || (p.zip && z.has(p.zip))));
}

/** The free plan's picks: best `n` by score, ties to the newest. */
export function pickWeekly(leads: Permit[], trade: TradeId, n: number, now: Date = new Date()): Permit[] {
  return [...leads].sort((a, b) => leadScore(b, trade, now) - leadScore(a, trade, now) || b.issuedDate.localeCompare(a.issuedDate)).slice(0, n);
}

/**
 * Keep the week's picks fixed: reuse last time's ids while they're still in the
 * window, and top up with the next best if some dropped out.
 */
export function weeklyLeads(
  leads: Permit[],
  trade: TradeId,
  n: number,
  saved: { weekStart: string; ids: string[] } | undefined,
  now: Date = new Date(),
): { picks: Permit[]; weekly: { weekStart: string; ids: string[] } } {
  const week = weekStart(now);
  const byId = new Map(leads.map((p) => [p.id, p]));
  const kept = saved?.weekStart === week ? saved.ids.map((id) => byId.get(id)).filter((p): p is Permit => Boolean(p)) : [];
  const rest = pickWeekly(leads.filter((p) => !kept.includes(p)), trade, n - kept.length, now);
  const picks = [...kept, ...rest].slice(0, n);
  return { picks, weekly: { weekStart: week, ids: picks.map((p) => p.id) } };
}

/** Daily plan: every lead, newest first, then by score. */
export function dailyLeads(leads: Permit[], trade: TradeId, now: Date = new Date()): Permit[] {
  return [...leads].sort((a, b) => b.issuedDate.localeCompare(a.issuedDate) || leadScore(b, trade, now) - leadScore(a, trade, now));
}

/** Leads issued since a digest was last sent (or in the last day). */
export function newSince(leads: Permit[], since: string | undefined, now: Date = new Date()): Permit[] {
  const from = since ? since.slice(0, 10) : new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  return leads.filter((p) => p.issuedDate >= from);
}

/**
 * Whether a digest is due: daily plans every morning at `hourUtc`, free plans
 * Monday morning. Returns which kind, or null.
 */
export function digestDue(a: { plan: "free" | "daily"; lastDigestAt?: string }, now: Date, hourUtc: number): "daily" | "weekly" | null {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc));
  if (now < today) return null;
  if (a.plan === "daily") return !a.lastDigestAt || Date.parse(a.lastDigestAt) < today.getTime() ? "daily" : null;
  const monday = new Date(`${weekStart(now)}T00:00:00Z`);
  monday.setUTCHours(hourUtc);
  if (now < monday) return null;
  return !a.lastDigestAt || Date.parse(a.lastDigestAt) < monday.getTime() ? "weekly" : null;
}

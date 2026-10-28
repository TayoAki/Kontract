import "server-only";
import { dateWhere, filterPermits, normalizePermit, permitContractors } from "./permit-normalize";
import { permitSource, selectedFields, sourcesForState, type PermitSource } from "./permit-sources";
import { TRADES } from "./permit-trades";
import type { Permit, PermitContractor, PermitQuery, PermitResults, PermitSourceResult, TradeId } from "./types";

// Fetch recent permits from city/county Socrata feeds (SoQL), normalize and
// tag them. Results are kept in memory for an hour per source and window.
// SOCRATA_APP_TOKEN (optional) raises Socrata's per-IP rate limits.

const TTL = 60 * 60 * 1000;
const MAX_ROWS = 2000;
const MAX_RETURNED = 300;

interface Entry {
  exp: number;
  permits: Permit[];
  error?: string;
}

const g = globalThis as unknown as { __kontractPermits?: Map<string, Entry | Promise<Entry>> };
const cache = (g.__kontractPermits ??= new Map());

export class PermitError extends Error {}

async function fetchRows(s: PermitSource, days: number): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    $select: selectedFields(s).join(","),
    $where: dateWhere(s, days),
    $order: s.dateFormat === "mdyy" ? ":id" : `${s.date} DESC`,
    $limit: String(MAX_ROWS),
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(`https://${s.domain}/resource/${s.dataset}.json?${params}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).match(/"message"\s*:\s*"([^"]+)"/)?.[1];
    throw Object.assign(new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`), { retry: res.status >= 500 || res.status === 429 });
  }
  return (await res.json()) as Record<string, unknown>[];
}

function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (err.name === "TimeoutError") return "the city's portal timed out";
  return err.message === "fetch failed" ? "couldn't reach the city's portal" : err.message;
}

async function load(s: PermitSource, days: number, previous?: Entry): Promise<Entry> {
  try {
    let rows: Record<string, unknown>[];
    try {
      rows = await fetchRows(s, days);
    } catch (err) {
      // Socrata portals have slow moments; one retry clears most of them.
      const retry = err instanceof Error && (err.name === "TimeoutError" || err.message === "fetch failed" || (err as { retry?: boolean }).retry);
      if (!retry) throw err;
      rows = await fetchRows(s, days);
    }
    const byId = new Map<string, Permit>();
    for (const row of rows) {
      const p = normalizePermit(s, row);
      if (p) byId.set(p.id, p);
    }
    return { exp: Date.now() + TTL, permits: [...byId.values()] };
  } catch (err) {
    const error = describe(err);
    // Keep showing the last good pull; try again in 5 minutes either way.
    if (previous?.permits.length) return { exp: Date.now() + 5 * 60 * 1000, permits: previous.permits, error: `${error}; showing the last pull` };
    return { exp: Date.now() + 5 * 60 * 1000, permits: [], error };
  }
}

async function fromSource(s: PermitSource, days: number): Promise<Entry> {
  const key = `${s.id}:${days}`;
  const hit = cache.get(key);
  if (hit && (hit instanceof Promise || hit.exp > Date.now())) return hit;
  const pending = load(s, days, hit instanceof Promise ? undefined : hit).then((entry) => {
    cache.set(key, entry);
    return entry;
  });
  cache.set(key, pending);
  return pending;
}

const DAYS = [1, 3, 7, 14, 30];

export interface PermitSearchResults extends PermitResults {
  /** Busiest permit pullers in the market. */
  contractors: PermitContractor[];
  /** Per trade, businesses pulling that trade's own permits: the likeliest buyers. */
  tradeContractors: Partial<Record<TradeId, PermitContractor[]>>;
}

export async function searchPermits(q: PermitQuery): Promise<PermitSearchResults> {
  const sources = q.source ? [permitSource(q.source)].filter((s): s is PermitSource => Boolean(s)) : sourcesForState(q.state);
  if (!q.state && !q.source) throw new PermitError("Pick a state.");
  if (sources.length === 0) throw new PermitError("No permit feeds for that state yet.");
  const days = DAYS.includes(q.days) ? q.days : 7;
  const entries = await Promise.all(sources.map((s) => fromSource(s, days)));
  const all = entries.flatMap((e) => e.permits);
  const filtered = filterPermits(all, { ...q, days });
  const sourceResults: PermitSourceResult[] = sources.map((s, i) => ({ id: s.id, name: s.name, count: entries[i]!.permits.length, error: entries[i]!.error }));
  return {
    ...filtered,
    permits: filtered.permits.slice(0, MAX_RETURNED),
    sources: sourceResults,
    contractors: permitContractors(all).slice(0, 40),
    tradeContractors: Object.fromEntries(
      TRADES.map((t) => [t.id, permitContractors(all, t.id).slice(0, 15)] as const).filter(([, list]) => list.length > 0),
    ),
  };
}

import "server-only";
import { getDb } from "./db";
import { feedHealth, healthWindow, type FeedCheck } from "./permit-health";
import { contractorName, dateWhere, filterPermits, normalizePermit, permitContractors } from "./permit-normalize";
import { feedsFor, PERMIT_MARKETS, PERMIT_SOURCES, permitMarket, selectedFields, type PermitSource } from "./permit-sources";
import { WORK } from "./permit-trades";
import type { FeedHealth, Permit, PermitContractor, PermitFeedInfo, PermitMarketInfo, PermitQuery, PermitResults, PermitSourceResult, WorkId } from "./types";

// Fetch recent permits from city/county Socrata feeds (SoQL), normalize and
// tag them. Results are kept in memory for an hour per feed and window. A
// background sync re-pulls every feed every 6 hours and records a health
// check, so a feed that breaks or quietly stops updating shows up.
// SOCRATA_APP_TOKEN (optional) raises Socrata's per-IP rate limits.

const TTL = 60 * 60 * 1000;
const SYNC_EVERY = 6 * 60 * 60 * 1000;
const MAX_ROWS = 5000;
const MAX_RETURNED = 300;

interface Entry {
  exp: number;
  permits: Permit[];
  error?: string;
}

const g = globalThis as unknown as {
  __kontractPermits?: Map<string, Entry | Promise<Entry>>;
  __kontractPermitSync?: ReturnType<typeof setInterval>;
};
const cache = (g.__kontractPermits ??= new Map());

export class PermitError extends Error {}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) h["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  return h;
}

async function soql(domain: string, dataset: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://${domain}/resource/${dataset}.json?${new URLSearchParams(params)}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).match(/"message"\s*:\s*"([^"]+)"/)?.[1];
    throw Object.assign(new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`), { retry: res.status >= 500 || res.status === 429 });
  }
  return (await res.json()) as Record<string, unknown>[];
}

const retryable = (err: unknown) =>
  err instanceof Error && (err.name === "TimeoutError" || err.message === "fetch failed" || Boolean((err as { retry?: boolean }).retry));

/** Socrata portals have slow moments; one retry clears most of them. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!retryable(err)) throw err;
    return fn();
  }
}

function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (err.name === "TimeoutError") return "the city's portal timed out";
  return err.message === "fetch failed" ? "couldn't reach the city's portal" : err.message;
}

/** San Francisco lists contractors in a separate dataset; join them in by permit number. */
async function joinContacts(s: PermitSource, permits: Permit[]): Promise<void> {
  const c = s.contacts;
  if (!c) return;
  const numbers = [...new Set(permits.map((p) => p.number).filter(Boolean))];
  const found = new Map<string, { contractor: string; license?: string }>();
  for (let i = 0; i < numbers.length; i += 100) {
    const chunk = numbers.slice(i, i + 100).map((n) => `'${n.replace(/'/g, "''")}'`);
    const rows = await withRetry(() =>
      soql(c.domain, c.dataset, {
        $select: [c.key, c.contractor, c.license].filter(Boolean).join(","),
        $where: `${c.where} AND ${c.key} in (${chunk.join(",")})`,
        $limit: "1000",
      }),
    ).catch(() => []);
    for (const r of rows) {
      const key = String(r[c.key] ?? "");
      const name = contractorName(r[c.contractor]);
      if (key && name && !found.has(key)) found.set(key, { contractor: name, license: c.license ? String(r[c.license] ?? "") || undefined : undefined });
    }
  }
  for (const p of permits) {
    const hit = found.get(p.number);
    if (hit && !p.contractor) {
      p.contractor = hit.contractor;
      p.contractorLicense ??= hit.license;
    }
  }
}

async function fetchFeed(s: PermitSource, days: number): Promise<Permit[]> {
  const rows = await withRetry(() =>
    soql(s.domain, s.dataset, {
      $select: selectedFields(s).join(","),
      $where: dateWhere(s, days),
      $order: s.dateFormat === "mdyy" ? ":id" : `${s.date} DESC`,
      $limit: String(MAX_ROWS),
    }),
  );
  const byId = new Map<string, Permit>();
  for (const row of rows) {
    const p = normalizePermit(s, row);
    if (p) byId.set(p.id, p);
  }
  const permits = [...byId.values()];
  await joinContacts(s, permits);
  return permits;
}

function recordCheck(feedId: string, check: FeedCheck): void {
  try {
    getDb()
      .prepare("INSERT INTO feed_check (feed_id, checked_at, days, ok, rows, latest, error, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(feedId, check.checkedAt, check.days, check.ok ? 1 : 0, check.rows, check.latest, check.error ?? null, check.ms ?? null);
  } catch (err) {
    console.error("couldn't record a feed check", err);
  }
}

async function load(s: PermitSource, days: number, previous?: Entry): Promise<Entry> {
  const started = Date.now();
  const checked = (ok: boolean, permits: Permit[], error?: string) => {
    // Only checks over the feed's health window are comparable over time.
    if (days !== healthWindow(s.cadence)) return;
    const latest = permits.reduce<string | null>((d, p) => (!d || p.issuedDate > d ? p.issuedDate : d), null);
    recordCheck(s.id, { checkedAt: new Date().toISOString(), days, ok, rows: permits.length, latest, error, ms: Date.now() - started });
  };
  try {
    const permits = await fetchFeed(s, days);
    checked(true, permits);
    return { exp: Date.now() + TTL, permits };
  } catch (err) {
    const error = describe(err);
    checked(false, [], error);
    // Keep showing the last good pull; try again in 5 minutes either way.
    if (previous?.permits.length) return { exp: Date.now() + 5 * 60 * 1000, permits: previous.permits, error: `${error}; showing the last pull` };
    return { exp: Date.now() + 5 * 60 * 1000, permits: [], error };
  }
}

async function fromSource(s: PermitSource, days: number, force = false): Promise<Entry> {
  const key = `${s.id}:${days}`;
  const hit = cache.get(key);
  if (hit && (hit instanceof Promise || (!force && hit.exp > Date.now()))) return hit;
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
  /** Per trade, businesses pulling that trade's own permits: the likeliest buyers and subs. */
  tradeContractors: Partial<Record<WorkId, PermitContractor[]>>;
}

async function permitsFor(q: { market?: string; state?: string }, days: number) {
  const feeds = feedsFor(q);
  const entries = await Promise.all(feeds.map((s) => fromSource(s, days)));
  const sources: PermitSourceResult[] = feeds.map((s, i) => ({ id: s.id, name: s.name, market: s.market, count: entries[i]!.permits.length, error: entries[i]!.error }));
  return { all: entries.flatMap((e) => e.permits), sources };
}

export async function searchPermits(q: PermitQuery): Promise<PermitSearchResults> {
  if (!q.state && !q.market) throw new PermitError("Pick a state.");
  if (q.market && !permitMarket(q.market)) throw new PermitError("We don't collect that city yet.");
  if (feedsFor(q).length === 0) throw new PermitError("No permit feeds for that state yet.");
  const days = DAYS.includes(q.days) ? q.days : 7;
  const { all, sources } = await permitsFor(q, days);
  const filtered = filterPermits(all, { ...q, days });
  return {
    ...filtered,
    permits: filtered.permits.slice(0, MAX_RETURNED),
    sources,
    contractors: permitContractors(all).slice(0, 40),
    tradeContractors: Object.fromEntries(
      WORK.map((w) => [w.id, permitContractors(all, w.id).slice(0, 15)] as const).filter(([, list]) => list.length > 0),
    ),
  };
}

export interface NearbyContractors {
  markets: { id: string; name: string }[];
  work: WorkId[];
  contractors: PermitContractor[];
  sources: PermitSourceResult[];
  days: number;
  /** The job's city had nobody, so these come from the rest of the state. */
  widenedFrom?: string;
  /** Known gaps in the job city's feeds that explain an empty list. */
  gaps: string[];
}

function pullers(all: Permit[], work: WorkId[]): PermitContractor[] {
  const merged = new Map<string, PermitContractor>();
  for (const w of work) {
    for (const c of permitContractors(all, w)) {
      const had = merged.get(c.key);
      if (!had || c.jobs > had.jobs) merged.set(c.key, c);
    }
  }
  return [...merged.values()].sort((a, b) => b.jobs - a.jobs || b.latest.localeCompare(a.latest)).slice(0, 25);
}

/**
 * Businesses pulling permits for this kind of work near a job: the city's
 * market if we cover it, else the whole state. When the city's feeds have
 * nobody for this work, it widens to the rest of the state.
 */
export async function contractorsNear(opts: { market?: string; state: string; work: WorkId[]; days?: number }): Promise<NearbyContractors> {
  const days = opts.days ?? 30;
  const city = opts.market ? permitMarket(opts.market) : undefined;
  const statewide = PERMIT_MARKETS.filter((m) => m.state === opts.state);
  const gaps = city ? [...new Set(feedsFor({ market: city.id }).flatMap((f) => f.gaps.filter((g) => /contractor/i.test(g))))] : [];
  if ((city ? 1 : statewide.length) === 0 || opts.work.length === 0) return { markets: [], work: opts.work, contractors: [], sources: [], days, gaps };
  const named = (ms: PermitMarketInfo[]) => ms.map((m) => ({ id: m.id, name: m.name }));
  if (city) {
    const near = await permitsFor({ market: city.id }, days);
    const contractors = pullers(near.all, opts.work);
    const others = statewide.filter((m) => m.id !== city.id);
    if (contractors.length > 0 || others.length === 0) return { markets: named([city]), work: opts.work, contractors, sources: near.sources, days, gaps };
    const wide = await permitsFor({ state: opts.state }, days);
    return { markets: named(others), work: opts.work, contractors: pullers(wide.all, opts.work), sources: wide.sources, days, widenedFrom: city.name, gaps };
  }
  const { all, sources } = await permitsFor({ state: opts.state }, days);
  return { markets: named(statewide), work: opts.work, contractors: pullers(all, opts.work), sources, days, gaps };
}

/** Recent permits for one market (or state), for a subscriber's lead list. */
export async function recentPermits(q: { market?: string; state?: string }, days: number): Promise<Permit[]> {
  return (await permitsFor(q, DAYS.includes(days) ? days : 7)).all;
}

// ---- Health ----

function checksFor(feedId: string): FeedCheck[] {
  const rows = getDb()
    .prepare("SELECT checked_at, days, ok, rows, latest, error, ms FROM feed_check WHERE feed_id = ? ORDER BY checked_at DESC LIMIT 30")
    .all(feedId) as { checked_at: string; days: number; ok: number; rows: number; latest: string | null; error: string | null; ms: number | null }[];
  return rows.map((r) => ({ checkedAt: r.checked_at, days: r.days, ok: r.ok === 1, rows: r.rows, latest: r.latest, error: r.error ?? undefined, ms: r.ms ?? undefined }));
}

export interface FeedWithHealth extends PermitFeedInfo {
  health: FeedHealth;
}

/** The source register with each feed's current health. */
export function permitRegister(): FeedWithHealth[] {
  const now = new Date();
  return PERMIT_SOURCES.map(({ id, market, name, state, kind, dataset, datasetUrl, cadence, gaps, lastVerified, status }) => ({
    id, market, name, state, kind, dataset, datasetUrl, cadence, gaps, lastVerified, status,
    health: feedHealth(cadence, checksFor(id), now),
  }));
}

/** Re-pull every feed over its health window, a few at a time. */
export async function checkAllFeeds(): Promise<void> {
  const queue = [...PERMIT_SOURCES];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) await fromSource(s, healthWindow(s.cadence), true);
    }),
  );
}

/** Start the 6-hourly permit sync (first run a minute after boot). */
export function startPermitSync(): void {
  if (g.__kontractPermitSync) return;
  const run = () => void checkAllFeeds().catch((err) => console.error("permit sync failed", err));
  setTimeout(run, 60_000).unref?.();
  g.__kontractPermitSync = setInterval(run, SYNC_EVERY);
  g.__kontractPermitSync.unref?.();
}

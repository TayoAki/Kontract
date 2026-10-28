import "server-only";
import { getDb } from "./db";
import { feedHealth, type FeedCheck } from "./permit-health";
import { BID_SOURCES, type BidSource } from "./sled-sources";
import type { BidFeedInfo, FeedHealth, Opportunity } from "./types";

// Open state and local bids, pulled from each feed every 3 hours and held in
// memory. Each pull is recorded as a health check alongside the permit feeds.

const SYNC_EVERY = 3 * 60 * 60 * 1000;

interface FeedState {
  items: Opportunity[];
  fetchedAt: string | null;
  error: string | null;
}

const g = globalThis as unknown as {
  __kontractSled?: Map<string, FeedState>;
  __kontractSledLoad?: Promise<void> | null;
  __kontractSledDone?: boolean;
  __kontractSledTimer?: ReturnType<typeof setInterval>;
};
const feeds = (g.__kontractSled ??= new Map());

const checkId = (s: BidSource) => `bids:${s.id}`;

async function pull(s: BidSource): Promise<void> {
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({ $where: s.where(today), $order: s.order, $limit: "1000" });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const prev = feeds.get(s.id);
  try {
    let res = await fetch(`https://${s.domain}/resource/${s.dataset}.json?${params}`, { headers, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (res.status >= 500) res = await fetch(`https://${s.domain}/resource/${s.dataset}.json?${params}`, { headers, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    const byId = new Map<string, Opportunity>();
    for (const r of rows) {
      const o = s.normalize(r);
      if (o) byId.set(o.id, o);
    }
    const items = [...byId.values()];
    feeds.set(s.id, { items, fetchedAt: new Date().toISOString(), error: null });
    const latest = items.reduce<string | null>((d, o) => (o.postedDate && (!d || o.postedDate > d) ? o.postedDate.slice(0, 10) : d), null);
    record(s, { checkedAt: new Date().toISOString(), days: 0, ok: true, rows: items.length, latest, ms: Date.now() - started });
  } catch (err) {
    const error = err instanceof Error ? (err.name === "TimeoutError" ? "the portal timed out" : err.message) : String(err);
    // Keep the last good pull.
    feeds.set(s.id, { items: prev?.items ?? [], fetchedAt: prev?.fetchedAt ?? null, error });
    record(s, { checkedAt: new Date().toISOString(), days: 0, ok: false, rows: 0, latest: null, error, ms: Date.now() - started });
  }
}

function record(s: BidSource, c: FeedCheck): void {
  try {
    getDb()
      .prepare("INSERT INTO feed_check (feed_id, checked_at, days, ok, rows, latest, error, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(checkId(s), c.checkedAt, c.days, c.ok ? 1 : 0, c.rows, c.latest, c.error ?? null, c.ms ?? null);
  } catch (err) {
    console.error("couldn't record a bid feed check", err);
  }
}

/** Pull every bid feed now. */
export function refreshSled(): Promise<void> {
  g.__kontractSledLoad ??= Promise.all(BID_SOURCES.map(pull))
    .then(() => {
      g.__kontractSledDone = true;
    })
    .finally(() => {
      g.__kontractSledLoad = null;
    });
  return g.__kontractSledLoad;
}

/** Open state and local bids; loads them the first time (and drops ones whose deadline passed). */
export async function sledOpportunities(): Promise<Opportunity[]> {
  // Until the first full pull finishes, wait for it rather than search half the feeds.
  if (!g.__kontractSledDone) await refreshSled();
  const now = Date.now();
  return [...feeds.values()].flatMap((f) => f.items).filter((o) => !o.responseDeadline || Date.parse(o.responseDeadline) >= now);
}

export function sledStatus(): { count: number; feeds: number; error: string | null } {
  const states = [...feeds.values()];
  const failed = BID_SOURCES.filter((s) => feeds.get(s.id)?.error);
  return {
    count: states.reduce((n, f) => n + f.items.length, 0),
    feeds: BID_SOURCES.length,
    error: failed.length ? `${failed.map((s) => s.name).join(", ")}: ${feeds.get(failed[0]!.id)!.error}` : null,
  };
}

export interface BidFeedWithHealth extends BidFeedInfo {
  health: FeedHealth;
}

/** The bid feeds in the source register, with health. */
export function bidRegister(): BidFeedWithHealth[] {
  const now = new Date();
  return BID_SOURCES.map((s) => {
    const rows = getDb()
      .prepare("SELECT checked_at, days, ok, rows, latest, error, ms FROM feed_check WHERE feed_id = ? ORDER BY checked_at DESC LIMIT 30")
      .all(checkId(s)) as { checked_at: string; days: number; ok: number; rows: number; latest: string | null; error: string | null; ms: number | null }[];
    const checks = rows.map((r) => ({ checkedAt: r.checked_at, days: r.days, ok: r.ok === 1, rows: r.rows, latest: r.latest, error: r.error ?? undefined, ms: r.ms ?? undefined }));
    const { id, name, portal, state, level, dataset, datasetUrl, cadence, gaps, lastVerified, status } = s;
    return { id, name, portal, state, level, dataset, datasetUrl, cadence, gaps, lastVerified, status, health: feedHealth(cadence, checks, now, { window: 0, noun: "open bids", checkStale: false }) };
  });
}

export function startSledSync(): void {
  if (g.__kontractSledTimer) return;
  void refreshSled().catch((err) => console.error("state and local bid sync failed", err));
  g.__kontractSledTimer = setInterval(() => void refreshSled().catch(() => undefined), SYNC_EVERY);
  g.__kontractSledTimer.unref?.();
}

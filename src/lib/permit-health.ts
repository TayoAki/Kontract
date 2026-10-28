import type { FeedCadence, FeedHealth } from "./types.ts";

// Pure health rules for a permit feed. A feed can fail loudly (an error) or
// quietly (a 200 with no rows, or permits that stop getting newer); both count.

export interface FeedCheck {
  checkedAt: string;
  days: number;
  ok: boolean;
  rows: number;
  /** Newest issue date among the rows (YYYY-MM-DD). */
  latest: string | null;
  error?: string;
  ms?: number;
}

/** The window health checks query: a week, or a month for feeds that post weekly. */
export const healthWindow = (cadence: FeedCadence) => (cadence === "weekly" ? 30 : 7);

/** Days a feed may go without a new permit before it counts as stale (weekends included). */
const STALE_AFTER: Record<FeedCadence, number> = { "several-daily": 3, daily: 4, weekly: 14 };

const DAY = 86400000;
const daysBetween = (isoDay: string, now: Date) => Math.floor((now.getTime() - Date.parse(`${isoDay}T12:00:00Z`)) / DAY);

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

/** Judge a feed from its checks (newest first). Bid feeds pass window 0 ("open now") and their own noun. */
export function feedHealth(
  cadence: FeedCadence,
  checks: FeedCheck[],
  now: Date = new Date(),
  opts: { window?: number; noun?: string; checkStale?: boolean } = {},
): FeedHealth {
  const window = opts.window ?? healthWindow(cadence);
  const noun = opts.noun ?? "permits";
  const span = window ? ` in the last ${window} days` : "";
  const same = checks.filter((c) => c.days === window);
  const last = same[0];
  if (!last) return { status: "unknown", detail: "Not checked yet." };
  const base = { checkedAt: last.checkedAt, latest: last.latest ?? undefined, rows: last.rows, ms: last.ms };
  if (!last.ok) {
    const lastGood = same.find((c) => c.ok);
    return {
      ...base,
      status: "failing",
      detail: `${last.error ?? "Request failed"}${lastGood ? `. Last good pull ${lastGood.checkedAt.slice(0, 10)}` : ""}.`,
    };
  }
  const earlier = same.slice(1, 11).filter((c) => c.ok);
  const usual = median(earlier.map((c) => c.rows));
  if (last.rows === 0) {
    return {
      ...base,
      status: "empty",
      detail: usual > 0 ? `No ${noun}${span}, but it usually has about ${usual}. The feed may be behind.` : `No ${noun}${span}.`,
    };
  }
  if (usual >= 20 && last.rows < usual * 0.2) {
    return { ...base, status: "empty", detail: `Only ${last.rows} ${noun}${span}; it usually has about ${usual}.` };
  }
  if (last.latest && opts.checkStale !== false) {
    const age = daysBetween(last.latest, now);
    if (age > STALE_AFTER[cadence]) return { ...base, status: "stale", detail: `Newest is ${age} days old.` };
  }
  const slow = last.ms && last.ms > 20000 ? ` Slow: ${Math.round(last.ms / 1000)} s.` : "";
  return { ...base, status: "ok", detail: `${last.rows.toLocaleString("en-US")} ${noun}${span}${last.latest ? `, newest ${last.latest}` : ""}.${slow}` };
}

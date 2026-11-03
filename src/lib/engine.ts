import "server-only";
import { samOpportunity } from "./sam-bulk";
import { sledOpportunities } from "./sled";
import { TRADES } from "./permit-trades";
import type { Opportunity, OpportunitySearch, OpportunitySort, PermitQuery, SignalStrength, TradeId } from "./types";

// Shared by the engine API routes (/api/v1): the same query parameters the
// app's own routes take, and notice lookup that works without a user.

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const bool = (v: string | null) => v === "1" || v === "true";
const SORTS: OpportunitySort[] = ["fit", "deadline", "newest"];
const STRENGTHS: SignalStrength[] = ["strong", "likely", "possible"];

/** The query params of /api/opportunities, with `limit` capped at 100. */
export function opportunitySearchFrom(p: URLSearchParams): { search: OpportunitySearch; page: { limit: number; offset: number } } {
  const sort = p.get("sort") as OpportunitySort | null;
  return {
    search: {
      q: p.get("q") ?? undefined,
      state: p.get("state")?.toUpperCase() || undefined,
      naics: p.get("naics") || undefined,
      setAside: p.get("setAside") || undefined,
      postedWithinDays: num(p.get("postedWithinDays")),
      minDaysToRespond: num(p.get("minDaysToRespond")),
      servicesOnly: bool(p.get("servicesOnly")),
      biddableOnly: bool(p.get("biddableOnly")),
      sort: sort && SORTS.includes(sort) ? sort : "fit",
      level: p.get("level") === "federal" ? "federal" : p.get("level") === "sled" ? "sled" : "",
    },
    page: { limit: Math.min(num(p.get("limit")) ?? 100, 100), offset: num(p.get("offset")) ?? 0 },
  };
}

/** The query params of /api/permits. */
export function permitQueryFrom(p: URLSearchParams): PermitQuery {
  const trade = p.get("trade") as TradeId | null;
  return {
    state: p.get("state")?.toUpperCase() || undefined,
    market: p.get("market") || undefined,
    days: num(p.get("days")) ?? 7,
    trade: trade && TRADES.some((t) => t.id === trade) ? trade : undefined,
    minValue: num(p.get("minValue")),
    residentialOnly: p.get("residentialOnly") === "1",
    q: p.get("q") || undefined,
    zip: p.get("zip")?.match(/^\d{5}$/)?.[0],
    leadsOnly: p.get("leadsOnly") === "1",
    hasContractor: p.get("hasContractor") === "1",
    minStrength: STRENGTHS.find((x) => x === p.get("minStrength")),
  };
}

/** An open notice by id, with its description: the SAM.gov index, then state and local bids. */
export async function openOpportunity(id: string): Promise<Opportunity | undefined> {
  return (await samOpportunity(id)) ?? (await sledOpportunities().catch(() => [])).find((o) => o.id === id);
}

export const NO_NOTICE = "No open notice with that id. For a closed federal notice, send the opportunity you saved.";

// SAM.gov notice ids (the only kind a caller's copy is taken for).
const NOTICE_ID = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * The notice to read: looked up by id first; the caller's copy only when the
 * id is no longer open (closed or awarded), so a tracked bid stays readable.
 * A copy is only taken for a federal notice, whose documents are listed by
 * SAM.gov's API from the id, so nothing in the copy decides what's fetched.
 */
export async function noticeFor(id: string, given: unknown): Promise<Opportunity | null> {
  const open = await openOpportunity(id);
  if (open) return open;
  const o = given as Opportunity | undefined;
  if (!NOTICE_ID.test(id) || !o || typeof o !== "object" || o.id !== id || typeof o.title !== "string" || !o.placeOfPerformance || !Array.isArray(o.contacts)) return null;
  return o.source === "sled" ? null : { ...o, source: "bulk", attachments: null };
}

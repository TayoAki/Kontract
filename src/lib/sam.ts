import "server-only";
import { addDays, toSamDate } from "./format";
import { isBiddable, isServiceCode } from "./fit-score";
import { sampleOpportunities } from "./sample-data";
import { htmlToText, normalizeNotice, type SamNotice } from "./sam-normalize";
import { cached } from "./store";
import type { Opportunity, OpportunityResults, OpportunitySearch } from "./types";

// SAM.gov "Get Opportunities" public API v2.
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
// Non-federal keys without a role are limited to ~10 requests/day, so each
// search is one request (filtered here) and results are cached.

const SEARCH_URL = "https://api.sam.gov/opportunities/v2/search";
const SEARCH_TTL = 2 * 60 * 60 * 1000;
const DESCRIPTION_TTL = 30 * 24 * 60 * 60 * 1000;

export const hasSamKey = () => Boolean(process.env.SAM_API_KEY);

export class SamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ---- Search ----

function applyFilters(list: Opportunity[], s: OpportunitySearch, now: Date): Opportunity[] {
  const q = s.q?.trim().toLowerCase();
  const minDeadline = s.minDaysToRespond ? addDays(now, s.minDaysToRespond).getTime() : null;
  return list.filter((o) => {
    if (s.biddableOnly && !isBiddable(o.type)) return false;
    if (s.servicesOnly && isServiceCode(o.pscCode) === false) return false;
    if (minDeadline && (!o.responseDeadline || Date.parse(o.responseDeadline) < minDeadline)) return false;
    if (o.isSample) {
      // SAM does these server-side for live data.
      if (q && !`${o.title} ${o.description ?? ""} ${o.agency}`.toLowerCase().includes(q)) return false;
      if (s.state && o.placeOfPerformance.state !== s.state) return false;
      if (s.naics && !o.naicsCode?.startsWith(s.naics)) return false;
      if (s.setAside && o.setAsideCode !== s.setAside) return false;
    }
    return true;
  });
}

const byDeadline = (a: Opportunity, b: Opportunity) =>
  (a.responseDeadline ?? "9999").localeCompare(b.responseDeadline ?? "9999");

export async function searchOpportunities(s: OpportunitySearch, now: Date = new Date()): Promise<OpportunityResults> {
  if (!hasSamKey()) {
    const results = applyFilters(sampleOpportunities(now), s, now).sort(byDeadline);
    return {
      results,
      total: results.length,
      source: "sample",
      notice: "Sample data. Add SAM_API_KEY to search live opportunities on SAM.gov.",
    };
  }

  const postedWithin = Math.min(Math.max(s.postedWithinDays ?? 30, 1), 364);
  const params = new URLSearchParams({
    postedFrom: toSamDate(addDays(now, -postedWithin)),
    postedTo: toSamDate(now),
    limit: "1000",
    offset: "0",
  });
  if (s.q?.trim()) params.set("title", s.q.trim());
  if (s.state) params.set("state", s.state);
  if (s.naics) params.set("ncode", s.naics);
  if (s.setAside) params.set("typeOfSetAside", s.setAside);
  if (s.minDaysToRespond) {
    params.set("rdlfrom", toSamDate(addDays(now, s.minDaysToRespond)));
    params.set("rdlto", toSamDate(addDays(now, 365)));
  }

  const key = `sam:search:${params.toString()}`;
  const raw = await cached(key, SEARCH_TTL, async () => {
    params.set("api_key", process.env.SAM_API_KEY!);
    const res = await fetch(`${SEARCH_URL}?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new SamError(samErrorMessage(res.status, await res.text()), res.status);
    const body = (await res.json()) as { totalRecords?: number; opportunitiesData?: SamNotice[] };
    return { totalRecords: body.totalRecords ?? 0, notices: body.opportunitiesData ?? [] };
  });

  const results = applyFilters(raw.notices.map(normalizeNotice), s, now).sort(byDeadline);
  return {
    results,
    total: results.length,
    source: "sam",
    notice:
      raw.totalRecords > raw.notices.length
        ? `Showing the newest ${raw.notices.length.toLocaleString()} of ${raw.totalRecords.toLocaleString()} notices. Add a keyword, state or NAICS code to narrow it down.`
        : undefined,
  };
}

function samErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) return "SAM.gov rejected the API key. Check SAM_API_KEY (keys expire every 90 days).";
  if (status === 429) return "SAM.gov's daily request limit was reached. Results are cached, so try again tomorrow or use a key with a role.";
  const detail = body.match(/"(?:errorMessage|message|error)"\s*:\s*"([^"]+)"/)?.[1];
  return `SAM.gov error ${status}${detail ? `: ${detail}` : ""}`;
}

export async function fetchDescription(descriptionUrl: string): Promise<string> {
  const url = new URL(descriptionUrl);
  if (url.hostname !== "api.sam.gov") throw new SamError("Unexpected description URL", 400);
  if (!hasSamKey()) throw new SamError("Add SAM_API_KEY to load full descriptions.", 400);
  return cached(`sam:desc:${url.searchParams.get("noticeid") ?? url.toString()}`, DESCRIPTION_TTL, async () => {
    url.searchParams.set("api_key", process.env.SAM_API_KEY!);
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (res.status === 404) return "";
    if (!res.ok) throw new SamError(samErrorMessage(res.status, await res.text()), res.status);
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { description?: string };
      return htmlToText(body.description ?? "");
    } catch {
      return htmlToText(text);
    }
  });
}

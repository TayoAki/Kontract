import { fail, json, withUser } from "@/lib/http";
import { searchSamOpportunities } from "@/lib/sam-bulk";
import { sledOpportunities } from "@/lib/sled";
import type { OpportunitySearch, OpportunitySort } from "@/lib/types";

export const dynamic = "force-dynamic";

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const bool = (v: string | null) => v === "1" || v === "true";
const SORTS: OpportunitySort[] = ["fit", "deadline", "newest"];

export const GET = withUser(async (req) => {
  const p = new URL(req.url).searchParams;
  const sort = p.get("sort") as OpportunitySort | null;
  const search: OpportunitySearch = {
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
  };
  const page = { limit: Math.min(num(p.get("limit")) ?? 100, 200), offset: num(p.get("offset")) ?? 0 };
  try {
    // State and local bids load in the background; don't hold a search up for a slow portal.
    const sled = await Promise.race([sledOpportunities(), new Promise<[]>((r) => setTimeout(() => r([]), 6000))]).catch(() => []);
    return json(await searchSamOpportunities(search, page, new Date(), search.level === "federal" ? [] : sled));
  } catch (err) {
    console.error("opportunity search failed", err);
    return fail("Search failed. Try again in a moment.", 500);
  }
});

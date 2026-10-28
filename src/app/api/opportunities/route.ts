import { fail, json } from "@/lib/http";
import { SamError, searchOpportunities } from "@/lib/sam";
import type { OpportunitySearch } from "@/lib/types";

export const dynamic = "force-dynamic";

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const bool = (v: string | null) => v === "1" || v === "true";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const search: OpportunitySearch = {
    q: p.get("q") ?? undefined,
    state: p.get("state")?.toUpperCase() || undefined,
    naics: p.get("naics") || undefined,
    setAside: p.get("setAside") || undefined,
    postedWithinDays: num(p.get("postedWithinDays")),
    minDaysToRespond: num(p.get("minDaysToRespond")),
    servicesOnly: bool(p.get("servicesOnly")),
    biddableOnly: bool(p.get("biddableOnly")),
  };
  try {
    return json(await searchOpportunities(search));
  } catch (err) {
    if (err instanceof SamError) return fail(err.message, err.status === 429 ? 429 : 502);
    console.error("opportunity search failed", err);
    return fail("Couldn't reach SAM.gov. Try again in a moment.", 502);
  }
}

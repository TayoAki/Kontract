import { opportunitySearchFrom } from "@/lib/engine";
import { fail, json } from "@/lib/http";
import { searchSamOpportunities } from "@/lib/sam-bulk";
import { withService } from "@/lib/service-auth";
import { sledOpportunities } from "@/lib/sled";
import { withoutDescription } from "@/lib/v1-shape";

export const dynamic = "force-dynamic";

/** Search open notices: the query params of /api/opportunities, at most 100 per page, without descriptions. */
export const GET = withService("/api/v1/opportunities", async (req) => {
  const { search, page } = opportunitySearchFrom(new URL(req.url).searchParams);
  try {
    // State and local bids load in the background; don't hold a search up for a slow portal.
    const sled = await Promise.race([sledOpportunities(), new Promise<[]>((r) => setTimeout(() => r([]), 6000))]).catch(() => []);
    const r = await searchSamOpportunities(search, page, new Date(), search.level === "federal" ? [] : sled);
    return json({ ...r, results: r.results.map(withoutDescription) });
  } catch (err) {
    console.error("v1 opportunity search failed", err);
    return fail("Search failed. Try again in a moment.", 500);
  }
});

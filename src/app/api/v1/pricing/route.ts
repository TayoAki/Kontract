import { fail, json, readBody } from "@/lib/http";
import { recipients } from "@/lib/pricing-stats";
import { withService } from "@/lib/service-auth";
import type { PricingQuery } from "@/lib/types";
import { PricingError, searchPastAwards } from "@/lib/usaspending";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Past awards from USAspending: the awards, typical price, and the companies that won them. */
export const POST = withService("/api/v1/pricing", async (req) => {
  const body = await readBody<{ query?: PricingQuery; context?: { agency?: string; state?: string } }>(req);
  if (!body?.query || !Array.isArray(body.query.keywords)) return fail("Missing query");
  try {
    const r = await searchPastAwards(body.query, body.context);
    return json({ ...r, recipients: recipients(r.awards) });
  } catch (err) {
    if (err instanceof PricingError) return fail(err.message, 400);
    console.error("v1 past award search failed", err);
    return fail("USAspending didn't respond. It can be slow; try again.", 502);
  }
});

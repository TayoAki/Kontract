import { fail, json, readBody, withUser } from "@/lib/http";
import { PricingError, searchPastAwards } from "@/lib/usaspending";
import type { PricingQuery } from "@/lib/types";

export const POST = withUser(async (req) => {
  const body = await readBody<{ query?: PricingQuery; context?: { agency?: string; state?: string } }>(req);
  if (!body?.query || !Array.isArray(body.query.keywords)) return fail("Missing query");
  try {
    return json(await searchPastAwards(body.query, body.context));
  } catch (err) {
    if (err instanceof PricingError) return fail(err.message, 400);
    console.error("past award search failed", err);
    return fail("USAspending didn't respond. It can be slow; try again.", 502);
  }
});

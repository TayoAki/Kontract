import { fail, json, readBody } from "@/lib/http";
import { findSubcontractors, PlacesError } from "@/lib/places";
import { withService } from "@/lib/service-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Local businesses (Google Places or Apify), cached a day per search. */
export const POST = withService("/api/v1/subcontractors", async (req) => {
  const body = await readBody<{ query?: string; location?: string }>(req);
  if (!body?.query) return fail("Enter what kind of company you're looking for.");
  try {
    return json(await findSubcontractors(body.query, body.location ?? ""));
  } catch (err) {
    if (err instanceof PlacesError) return fail(err.message, 502);
    console.error("v1 subcontractor search failed", err);
    return fail("Business search failed. Try again.", 502);
  }
});

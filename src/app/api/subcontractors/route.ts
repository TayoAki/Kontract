import { fail, json, readBody, withUser } from "@/lib/http";
import { findSubcontractors, PlacesError } from "@/lib/places";

export const POST = withUser(async (req) => {
  const body = await readBody<{ query?: string; location?: string }>(req);
  if (!body?.query) return fail("Enter what kind of company you're looking for.");
  try {
    return json(await findSubcontractors(body.query, body.location ?? ""));
  } catch (err) {
    if (err instanceof PlacesError) return fail(err.message, 502);
    console.error("subcontractor search failed", err);
    return fail("Business search failed. Try again.", 502);
  }
});

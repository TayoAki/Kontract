import { permitQueryFrom } from "@/lib/engine";
import { fail, json } from "@/lib/http";
import { PermitError, searchPermits } from "@/lib/permits";
import { withService } from "@/lib/service-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Recent permits grouped by address: the query params of /api/permits. */
export const GET = withService("/api/v1/permits", async (req) => {
  try {
    return json(await searchPermits(permitQueryFrom(new URL(req.url).searchParams)));
  } catch (err) {
    if (err instanceof PermitError) return fail(err.message, 400);
    console.error("v1 permit search failed", err);
    return fail("Permit search failed. Try again.", 500);
  }
});

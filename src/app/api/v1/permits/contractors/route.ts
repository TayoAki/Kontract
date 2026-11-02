import { fail, json } from "@/lib/http";
import { marketForCity, permitMarket } from "@/lib/permit-sources";
import { WORK } from "@/lib/permit-trades";
import { contractorsNear } from "@/lib/permits";
import { withService } from "@/lib/service-auth";
import type { WorkId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Businesses pulling permits for this work near a job: ?state=TX&city=Austin&work=hvac,plumbing. Returns PermitContractor[]. */
export const GET = withService("/api/v1/permits/contractors", async (req) => {
  const p = new URL(req.url).searchParams;
  const state = p.get("state")?.toUpperCase();
  if (!state || !/^[A-Z]{2}$/.test(state)) return fail("Pick a state.");
  const work = (p.get("work") ?? "").split(",").filter((w): w is WorkId => WORK.some((x) => x.id === w));
  const market = permitMarket(p.get("market") ?? undefined) ?? marketForCity(p.get("city") ?? undefined, state);
  try {
    return json((await contractorsNear({ market: market?.id, state, work })).contractors);
  } catch (err) {
    console.error("v1 nearby contractors failed", err);
    return fail("Couldn't load permit contractors. Try again.", 500);
  }
});

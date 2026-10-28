import { fail, json, withUser } from "@/lib/http";
import { marketForCity, permitMarket } from "@/lib/permit-sources";
import { WORK } from "@/lib/permit-trades";
import { contractorsNear } from "@/lib/permits";
import type { WorkId } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Businesses pulling permits for this kind of work near a job. ?state=TX&city=Austin&work=hvac,plumbing */
export const GET = withUser(async (req) => {
  const p = new URL(req.url).searchParams;
  const state = p.get("state")?.toUpperCase();
  if (!state || !/^[A-Z]{2}$/.test(state)) return fail("Pick a state.");
  const work = (p.get("work") ?? "").split(",").filter((w): w is WorkId => WORK.some((x) => x.id === w));
  const market = permitMarket(p.get("market") ?? undefined) ?? marketForCity(p.get("city") ?? undefined, state);
  try {
    return json(await contractorsNear({ market: market?.id, state, work }));
  } catch (err) {
    console.error("nearby contractors failed", err);
    return fail("Couldn't load permit contractors. Try again.", 500);
  }
});

import { fail, json, readBody, withUser } from "@/lib/http";
import { listDeals, saveDeal } from "@/lib/store";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_req, user) => json({ deals: await listDeals(user.id) }));

export const PUT = withUser(async (req, user) => {
  const deal = await readBody<Deal>(req);
  if (!deal?.id || deal.opportunity?.id !== deal.id || !Array.isArray(deal.subs) || !deal.pricing) {
    return fail("Invalid deal");
  }
  return json({ deal: await saveDeal(user.id, { ...deal, updatedAt: new Date().toISOString() }) });
});

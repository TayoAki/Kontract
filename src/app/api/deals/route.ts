import { fail, json, readBody } from "@/lib/http";
import { listDeals, saveDeal } from "@/lib/store";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ deals: await listDeals() });
}

export async function PUT(req: Request) {
  const deal = await readBody<Deal>(req);
  if (!deal?.id || deal.opportunity?.id !== deal.id || !Array.isArray(deal.subs) || !deal.pricing) {
    return fail("Invalid deal");
  }
  return json({ deal: await saveDeal({ ...deal, updatedAt: new Date().toISOString() }) });
}

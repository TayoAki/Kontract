import { fail, json, readBody, withUser } from "@/lib/http";
import { createQuoteRequest, listQuoteRequests } from "@/lib/quotes";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Your quote links (for one bid with ?dealId=). */
export const GET = withUser(async (req, user) => {
  const dealId = new URL(req.url).searchParams.get("dealId") ?? undefined;
  return json({ requests: listQuoteRequests(user.id, dealId) });
});

/** Create the quote link for a sub on a bid. Body: { deal, subId }. */
export const POST = withUser(async (req, user) => {
  const body = await readBody<{ deal?: Deal; subId?: string }>(req);
  if (!body?.deal?.id || !Array.isArray(body.deal.subs) || !body.subId) return fail("Pick a bid and a subcontractor.");
  try {
    return json({ request: await createQuoteRequest(user.id, body.deal, body.subId) });
  } catch (err) {
    return fail((err as Error).message);
  }
});

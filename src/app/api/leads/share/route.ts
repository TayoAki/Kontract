import { fail, json, readBody, withUser } from "@/lib/http";
import { createLeadShare, LeadShareError, listLeadShares } from "@/lib/leads";
import type { Permit, TradeId } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Leads you've passed to subs; ?permit= for one permit. */
export const GET = withUser(async (req, user) => json({ shares: listLeadShares(user.id, new URL(req.url).searchParams.get("permit") ?? undefined) }));

/** Pass a permit to a sub as a lead. Body: { permit, trade, contactId? | toName + toEmail?, note? }. */
export const POST = withUser(async (req, user) => {
  const body = await readBody<{ permit?: Permit; trade?: TradeId; contactId?: string; toName?: string; toEmail?: string; note?: string }>(req);
  if (!body?.permit || !body.trade) return fail("Pick a permit and a trade.");
  try {
    return json({ share: await createLeadShare(user.id, { permit: body.permit, trade: body.trade, contactId: body.contactId, toName: body.toName, toEmail: body.toEmail, note: body.note }) });
  } catch (err) {
    if (err instanceof LeadShareError) return fail(err.message);
    console.error("lead share failed", err);
    return fail("Couldn't make the lead link. Try again.", 500);
  }
});

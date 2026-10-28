import { fail, json, withUser } from "@/lib/http";
import { getAccount } from "@/lib/store";
import { BillingError, portalUrl } from "@/lib/stripe";

/** Open Stripe's billing portal to change or cancel the plan. */
export const POST = withUser(async (req, user) => {
  try {
    const origin = process.env.BETTER_AUTH_URL || new URL(req.url).origin;
    return json({ url: await portalUrl(await getAccount(user.id), origin) });
  } catch (err) {
    if (err instanceof BillingError) return fail(err.message, 400);
    console.error("billing portal failed", err);
    return fail("Couldn't open billing. Try again.", 500);
  }
});

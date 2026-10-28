import { fail, json, withUser } from "@/lib/http";
import { getAccount } from "@/lib/store";
import { BillingError, checkoutUrl } from "@/lib/stripe";

/** Start Stripe Checkout for the daily-leads plan. */
export const POST = withUser(async (req, user) => {
  try {
    const origin = process.env.BETTER_AUTH_URL || new URL(req.url).origin;
    return json({ url: await checkoutUrl(user.id, user.email, await getAccount(user.id), origin) });
  } catch (err) {
    if (err instanceof BillingError) return fail(err.message, 400);
    console.error("checkout failed", err);
    return fail("Couldn't start checkout. Try again.", 500);
  }
});

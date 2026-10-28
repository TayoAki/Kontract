import { fail, json } from "@/lib/http";
import { handleStripeEvent } from "@/lib/stripe";
import { verifyStripeSignature } from "@/lib/stripe-signature";

// Stripe calls this; the signature is the only authentication.

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return fail("Webhook not configured", 503);
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) return fail("Bad signature", 400);
  try {
    const result = await handleStripeEvent(JSON.parse(payload));
    console.log("stripe webhook:", result);
    return json({ received: true });
  } catch (err) {
    console.error("stripe webhook failed", err);
    return fail("Webhook handling failed", 500);
  }
}

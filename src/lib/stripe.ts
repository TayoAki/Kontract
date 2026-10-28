import "server-only";
import { listAccounts, saveAccount } from "./store";
import type { Account } from "./types";

// Stripe Checkout for the daily-leads plan, and the billing portal to manage
// or cancel it. Needs STRIPE_SECRET_KEY and STRIPE_PRICE_ID (a recurring
// monthly price); STRIPE_WEBHOOK_SECRET verifies the webhook that switches plans.

export class BillingError extends Error {}

async function stripe<T>(path: string, form: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingError("Payments aren't set up yet (STRIPE_SECRET_KEY).");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new BillingError(body.error?.message ?? `Stripe returned ${res.status}`);
  return body;
}

export async function checkoutUrl(userId: string, email: string, account: Account, origin: string): Promise<string> {
  const price = process.env.STRIPE_PRICE_ID;
  if (!price) throw new BillingError("Payments aren't set up yet (STRIPE_PRICE_ID).");
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: userId,
    "metadata[userId]": userId,
    "subscription_data[metadata][userId]": userId,
  };
  if (account.stripeCustomerId) form.customer = account.stripeCustomerId;
  else form.customer_email = email;
  return (await stripe<{ url: string }>("checkout/sessions", form)).url;
}

export async function portalUrl(account: Account, origin: string): Promise<string> {
  if (!account.stripeCustomerId) throw new BillingError("No subscription to manage yet.");
  return (await stripe<{ url: string }>("billing_portal/sessions", { customer: account.stripeCustomerId, return_url: `${origin}/` })).url;
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

function findAccount(userId: unknown, subscriptionId: unknown, customerId: unknown) {
  const all = listAccounts();
  return (
    all.find((a) => typeof userId === "string" && a.userId === userId) ??
    all.find((a) => subscriptionId && a.account.stripeSubscriptionId === subscriptionId) ??
    all.find((a) => customerId && a.account.stripeCustomerId === customerId)
  );
}

/** Switch plans from Stripe's events. Returns what changed, for logging. */
export async function handleStripeEvent(e: StripeEvent): Promise<string> {
  const o = e.data.object;
  const meta = (o.metadata ?? {}) as Record<string, string>;
  if (e.type === "checkout.session.completed") {
    const hit = findAccount(o.client_reference_id ?? meta.userId, o.subscription, o.customer);
    if (!hit) return "no matching account";
    await saveAccount(hit.userId, { ...hit.account, plan: "daily", planSince: new Date().toISOString(), stripeCustomerId: String(o.customer ?? "") || hit.account.stripeCustomerId, stripeSubscriptionId: String(o.subscription ?? "") || hit.account.stripeSubscriptionId });
    return `${hit.userId} → daily`;
  }
  if (e.type === "customer.subscription.updated" || e.type === "customer.subscription.deleted") {
    const hit = findAccount(meta.userId, o.id, o.customer);
    if (!hit) return "no matching account";
    const active = e.type === "customer.subscription.updated" && (o.status === "active" || o.status === "trialing");
    const plan = active ? "daily" : "free";
    if (plan !== hit.account.plan) await saveAccount(hit.userId, { ...hit.account, plan, planSince: new Date().toISOString() });
    return `${hit.userId} → ${plan}`;
  }
  return "ignored";
}

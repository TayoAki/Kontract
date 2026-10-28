// Subcontractor plans. Free: the best 10 permit leads in their trade and area
// each week. Daily: every new lead each morning, paid through Stripe.
// DAILY_LEADS_PRICE_USD sets the price shown; STRIPE_PRICE_ID sets what's charged.

export const FREE_LEADS_PER_WEEK = 10;

export interface PlanConfig {
  freePerWeek: number;
  dailyPrice: number;
  /** Stripe is configured, so subs can upgrade. */
  payments: boolean;
  /** An email provider is configured, so digests go out by email. */
  email: boolean;
}

export function planConfig(env: Record<string, string | undefined> = process.env): PlanConfig {
  const price = Number(env.DAILY_LEADS_PRICE_USD);
  return {
    freePerWeek: FREE_LEADS_PER_WEEK,
    dailyPrice: Number.isFinite(price) && price > 0 ? price : 99,
    payments: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID),
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
  };
}

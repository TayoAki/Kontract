import { json, withUser } from "@/lib/http";
import { leadSharesForEmail } from "@/lib/leads";

export const dynamic = "force-dynamic";

/** Leads primes have passed to this account's email. */
export const GET = withUser(async (_req, user) => json({ leads: leadSharesForEmail(user.email) }));

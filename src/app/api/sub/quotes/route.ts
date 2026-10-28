import { json, withUser } from "@/lib/http";
import { quoteRequestsForEmail } from "@/lib/quotes";

export const dynamic = "force-dynamic";

/** Quote requests primes have sent to this account's email. */
export const GET = withUser(async (_req, user) => json({ requests: quoteRequestsForEmail(user.email) }));

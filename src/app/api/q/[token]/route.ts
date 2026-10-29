import { fail, json, readBody } from "@/lib/http";
import { openQuote, submitQuote } from "@/lib/quotes";

// Public: the link is the credential. No account needed to quote.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const quote = openQuote((await params).token, { preview });
  return quote ? json(quote) : fail("This quote link doesn't exist or has been removed.", 404);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const body = await readBody<unknown>(req);
  const r = submitQuote((await params).token, body);
  return r.ok ? json({ ok: true, response: r.response }) : fail(r.error, r.status);
}

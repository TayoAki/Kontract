import { BidReadError, checkQuotes } from "@/lib/bid-documents";
import { NO_NOTICE, noticeFor } from "@/lib/engine";
import { fail, json, readBody } from "@/lib/http";
import { SamError } from "@/lib/sam";
import { withService } from "@/lib/service-auth";
import { quoteList } from "@/lib/v1-shape";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Check quotes against a notice's documents: whether each is really there, in which document and on which page. */
export const POST = withService("/api/v1/opportunities/:id/quotes", async (req, _caller, { params }: { params: Promise<{ id: string }> }) => {
  const body = await readBody<{ quotes?: unknown; opportunity?: unknown }>(req);
  const quotes = quoteList(body?.quotes);
  if (typeof quotes === "string") return fail(quotes, 400);
  const o = await noticeFor((await params).id, body?.opportunity);
  if (!o) return fail(NO_NOTICE, 404);
  try {
    return json({ results: await checkQuotes(o, quotes) });
  } catch (err) {
    if (err instanceof BidReadError || err instanceof SamError) return fail(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
    console.error("v1 quote check failed", err);
    return fail("Couldn't read the attachments. Try again in a minute.", 502);
  }
});

import { bidDocumentText, BidReadError } from "@/lib/bid-documents";
import { NO_NOTICE, noticeFor } from "@/lib/engine";
import { fail, json, readBody } from "@/lib/http";
import { SamError } from "@/lib/sam";
import { withService } from "@/lib/service-auth";
import type { BidTextPage } from "@/lib/types";
import { pageText, textPaging } from "@/lib/v1-shape";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** A notice's documents as one text, a page at a time, for the caller's own model to read. No Claude here. */
export const POST = withService("/api/v1/opportunities/:id/text", async (req, _caller, { params }: { params: Promise<{ id: string }> }) => {
  const body = await readBody<{ offset?: unknown; limit?: unknown; opportunity?: unknown }>(req);
  const paging = textPaging(body);
  if (typeof paging === "string") return fail(paging, 400);
  const o = await noticeFor((await params).id, body?.opportunity);
  if (!o) return fail(NO_NOTICE, 404);
  try {
    const t = await bidDocumentText(o);
    const page = pageText(t.text, paging.offset, paging.limit);
    const out: BidTextPage = {
      noticeId: o.id,
      fingerprint: t.fingerprint,
      totalChars: t.text.length,
      offset: page.offset,
      nextOffset: page.nextOffset,
      documents: t.documents,
      text: page.text,
    };
    return json(out);
  } catch (err) {
    if (err instanceof BidReadError || err instanceof SamError) return fail(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
    console.error("v1 bid text failed", err);
    return fail("Couldn't read the attachments. Try again in a minute.", 502);
  }
});

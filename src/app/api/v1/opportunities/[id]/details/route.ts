import { BidReadError, readBid, readBidWithClaude } from "@/lib/bid-documents";
import { explainClaudeError } from "@/lib/claude";
import { NO_NOTICE, noticeFor } from "@/lib/engine";
import { fail, json, readBody } from "@/lib/http";
import { SamError } from "@/lib/sam";
import { withService } from "@/lib/service-auth";
import { trimDetails } from "@/lib/v1-shape";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Read a notice's attachments: budget, bonds, dates, requirements, forms (Claude's scope reading with claude: true). */
export const POST = withService("/api/v1/opportunities/:id/details", async (req, caller, { params }: { params: Promise<{ id: string }> }) => {
  const body = await readBody<{ claude?: boolean; opportunity?: unknown }>(req);
  const o = await noticeFor((await params).id, body?.opportunity);
  if (!o) return fail(NO_NOTICE, 404);
  const claude = body?.claude === true;
  if (claude) {
    const limited = caller.claudeLimit();
    if (limited) return limited;
  }
  try {
    return json({ details: trimDetails(claude ? await readBidWithClaude(o) : await readBid(o)) });
  } catch (err) {
    if (err instanceof BidReadError || err instanceof SamError) return fail(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
    if (claude) {
      const e = explainClaudeError(err);
      return fail(e.message, e.status);
    }
    console.error("v1 bid read failed", err);
    return fail("Couldn't read the attachments. Try again in a minute.", 502);
  }
});

import { BidReadError, readBid, readBidWithClaude } from "@/lib/bid-documents";
import { explainClaudeError } from "@/lib/claude";
import { fail, json, readBody, withUser } from "@/lib/http";
import { SamError } from "@/lib/sam";
import { samDescription } from "@/lib/sam-bulk";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Read a notice's attachments for the facts that decide a bid. Body: { opportunity, claude?: true }. */
export const POST = withUser(async (req) => {
  const body = await readBody<{ opportunity?: Opportunity; claude?: boolean }>(req);
  const given = body?.opportunity;
  const claude = body?.claude === true;
  if (!given?.id || typeof given.title !== "string") return fail("Missing the notice.");
  // Search results arrive without the notice text; the rules read it too.
  const o = given.source === "bulk" && given.description === undefined ? { ...given, description: (await samDescription(given.id)) ?? "" } : given;
  try {
    return json({ details: claude ? await readBidWithClaude(o) : await readBid(o) });
  } catch (err) {
    if (err instanceof BidReadError || err instanceof SamError) return fail(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
    if (claude) {
      const e = explainClaudeError(err);
      return fail(e.message, e.status);
    }
    console.error("bid read failed", err);
    return fail("Couldn't read the attachments. Try again in a minute.", 502);
  }
});

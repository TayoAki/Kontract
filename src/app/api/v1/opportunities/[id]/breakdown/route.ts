import { claudeBreakdown, explainClaudeError, hasClaude, MODEL } from "@/lib/claude";
import { noticeFor } from "@/lib/engine";
import { fail, json, readBody } from "@/lib/http";
import { rulesBreakdown } from "@/lib/rules";
import { withService } from "@/lib/service-auth";
import { cacheGet, cacheSet } from "@/lib/store";
import type { Breakdown } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TTL = 30 * 24 * 60 * 60 * 1000;

/** A plain-English read of a notice: Claude's when it's set up (cached a month per notice), else the rules. */
export const POST = withService("/api/v1/opportunities/:id/breakdown", async (req, caller, { params }: { params: Promise<{ id: string }> }) => {
  const body = await readBody<{ opportunity?: unknown }>(req);
  const o = await noticeFor((await params).id, body?.opportunity);
  if (!o) return fail("No open notice with that id. For a closed federal notice, send the opportunity you saved.", 404);
  if (!hasClaude()) return json({ breakdown: rulesBreakdown(o), source: "rules" });
  const key = `breakdown:${MODEL}:${o.id}`;
  const hit = await cacheGet<Breakdown>(key);
  if (hit) return json({ breakdown: hit, source: "claude" });
  const limited = caller.claudeLimit();
  if (limited) return limited;
  try {
    const breakdown = await claudeBreakdown(o);
    await cacheSet(key, breakdown, TTL);
    return json({ breakdown, source: "claude" });
  } catch (err) {
    const e = explainClaudeError(err);
    console.error("v1 breakdown failed", err);
    return fail(e.message, e.status);
  }
});

import { claudeBreakdown, explainClaudeError, hasClaude, MODEL } from "@/lib/claude";
import { fail, json, readBody } from "@/lib/http";
import { rulesBreakdown } from "@/lib/rules";
import { fetchDescription, hasSamKey } from "@/lib/sam";
import { cacheGet, cacheSet } from "@/lib/store";
import type { Breakdown, Opportunity } from "@/lib/types";

const TTL = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const body = await readBody<{ opportunity?: Opportunity; refresh?: boolean }>(req);
  const o = body?.opportunity;
  if (!o?.id || !o.title) return fail("Missing opportunity");

  if (!o.description && o.descriptionUrl && hasSamKey()) {
    try {
      o.description = await fetchDescription(o.descriptionUrl);
    } catch (err) {
      console.warn("description fetch failed; continuing without it", err);
    }
  }

  if (!hasClaude()) return json({ breakdown: rulesBreakdown(o), description: o.description ?? null });

  const key = `breakdown:${MODEL}:${o.id}`;
  if (!body?.refresh) {
    const hit = await cacheGet<Breakdown>(key);
    if (hit) return json({ breakdown: hit, description: o.description ?? null });
  }
  try {
    const breakdown = await claudeBreakdown(o);
    await cacheSet(key, breakdown, TTL);
    return json({ breakdown, description: o.description ?? null });
  } catch (err) {
    const e = explainClaudeError(err);
    console.error("breakdown failed", err);
    return fail(e.message, e.status);
  }
}

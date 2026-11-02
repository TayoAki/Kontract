import { spentMicro } from "@/lib/cost-meter";
import { explainClaudeError, hasClaude, streamDraft, type Effort } from "@/lib/claude";
import { fail, readBody } from "@/lib/http";
import { outreachPrompt, proposalPrompt, sowPrompt } from "@/lib/prompts";
import { samDescription } from "@/lib/sam-bulk";
import { withService } from "@/lib/service-auth";
import { EMPTY_PROFILE } from "@/lib/store";
import { outreachTemplate, proposalTemplate, sowTemplate } from "@/lib/templates";
import type { CompanyProfile, Deal, DraftKind } from "@/lib/types";

// Streams newline-delimited JSON, the same events as /api/ai/draft:
//   {"type":"meta","source":"claude"|"template"}, {"type":"text","text":"..."}*,
//   maybe {"type":"error","message":"..."}, then {"type":"done","costMicro":n}.
// The company profile comes from the request; nothing in it is stored.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EFFORT: Record<DraftKind, Effort> = { sow: "medium", outreach: "low", proposal: "high" };

export const POST = withService("/api/v1/drafts", async (req, caller) => {
  const body = await readBody<{ kind?: DraftKind; deal?: Deal; profile?: Partial<CompanyProfile>; subId?: string }>(req);
  const kind = body?.kind;
  const deal = body?.deal;
  if (!kind || !(kind in EFFORT)) return fail("Unknown draft kind");
  if (!deal?.opportunity || !Array.isArray(deal.subs) || !deal.pricing) return fail("Missing deal");
  if (!body.profile || typeof body.profile !== "object") return fail("Missing profile");

  if (deal.opportunity.description === undefined && deal.opportunity.source === "bulk") {
    deal.opportunity.description = await samDescription(deal.opportunity.id);
  }
  const profile: CompanyProfile = { ...EMPTY_PROFILE, ...body.profile };
  const sub = body.subId ? deal.subs.find((s) => s.id === body.subId) : undefined;
  const encoder = new TextEncoder();
  const line = (e: unknown) => encoder.encode(`${JSON.stringify(e)}\n`);
  const headers = { "Content-Type": "application/x-ndjson; charset=utf-8" };

  if (!hasClaude()) {
    const text = kind === "sow" ? sowTemplate(deal, profile) : kind === "outreach" ? outreachTemplate(deal, profile, sub) : proposalTemplate(deal, profile);
    return new Response(new Uint8Array([...line({ type: "meta", source: "template" }), ...line({ type: "text", text }), ...line({ type: "done", costMicro: 0 })]), { headers });
  }
  const limited = caller.claudeLimit();
  if (limited) return limited;

  const prompt = kind === "sow" ? sowPrompt(deal, profile) : kind === "outreach" ? outreachPrompt(deal, profile, sub) : proposalPrompt(deal, profile);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "meta", source: "claude" }));
      try {
        for await (const event of streamDraft(prompt, EFFORT[kind], req.signal)) controller.enqueue(line(event));
      } catch (err) {
        if (!req.signal.aborted) {
          console.error(`v1 ${kind} draft failed`, err);
          controller.enqueue(line({ type: "error", message: explainClaudeError(err).message }));
        }
      } finally {
        controller.enqueue(line({ type: "done", costMicro: spentMicro() }));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers });
});

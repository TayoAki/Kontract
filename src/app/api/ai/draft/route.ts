import { explainClaudeError, hasClaude, streamDraft, type Effort } from "@/lib/claude";
import { fail, readBody } from "@/lib/http";
import { outreachPrompt, proposalPrompt, sowPrompt } from "@/lib/prompts";
import { samDescription } from "@/lib/sam-bulk";
import { getProfile } from "@/lib/store";
import { outreachTemplate, proposalTemplate, sowTemplate } from "@/lib/templates";
import type { Deal, DraftKind } from "@/lib/types";

// Streams newline-delimited JSON events:
//   {"type":"meta","source":"claude"|"template"}  then  {"type":"text","text":"..."}*
//   and possibly {"type":"error","message":"..."}

const EFFORT: Record<DraftKind, Effort> = { sow: "medium", outreach: "low", proposal: "high" };

export async function POST(req: Request) {
  const body = await readBody<{ kind?: DraftKind; deal?: Deal; subId?: string }>(req);
  const kind = body?.kind;
  const deal = body?.deal;
  if (!kind || !(kind in EFFORT)) return fail("Unknown draft kind");
  if (!deal?.opportunity) return fail("Missing deal");

  if (deal.opportunity.description === undefined && deal.opportunity.source === "bulk") {
    deal.opportunity.description = await samDescription(deal.opportunity.id);
  }
  const profile = await getProfile();
  const sub = body.subId ? deal.subs.find((s) => s.id === body.subId) : undefined;
  const encoder = new TextEncoder();
  const line = (e: unknown) => encoder.encode(`${JSON.stringify(e)}\n`);
  const headers = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };

  if (!hasClaude()) {
    const text =
      kind === "sow" ? sowTemplate(deal, profile) : kind === "outreach" ? outreachTemplate(deal, profile, sub) : proposalTemplate(deal, profile);
    const out = new Uint8Array([...line({ type: "meta", source: "template" }), ...line({ type: "text", text })]);
    return new Response(out, { headers });
  }

  const prompt =
    kind === "sow" ? sowPrompt(deal, profile) : kind === "outreach" ? outreachPrompt(deal, profile, sub) : proposalPrompt(deal, profile);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "meta", source: "claude" }));
      try {
        for await (const event of streamDraft(prompt, EFFORT[kind], req.signal)) controller.enqueue(line(event));
      } catch (err) {
        if (!req.signal.aborted) {
          console.error(`${kind} draft failed`, err);
          controller.enqueue(line({ type: "error", message: explainClaudeError(err).message }));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers });
}

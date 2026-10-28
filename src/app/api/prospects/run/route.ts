import { explainClaudeError, hasClaude } from "@/lib/claude";
import { fail, readBody, withUser } from "@/lib/http";
import { nextRunAllowed, normalizeWebsite, SIGNAL_KINDS } from "@/lib/prospect-rules";
import { findProspects } from "@/lib/prospects";
import { getAccount, getLastRun, saveAccount } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Streams newline-delimited JSON progress events (see ProspectEvent).

export const POST = withUser(async (req, user) => {
  const body = await readBody<{ website?: string; kinds?: string[] }>(req);
  const website = normalizeWebsite(body?.website ?? "");
  if (!website) return fail("Enter your website, like yourcompany.com.");
  const kinds = (body?.kinds ?? []).filter((k) => SIGNAL_KINDS.some((s) => s.id === k));
  const account = await getAccount(user.id);
  const last = await getLastRun(user.id);
  // Each real run spends Claude credits: weekly on free, daily on the daily plan.
  if (hasClaude() && last && !last.error && !last.sample) {
    const next = nextRunAllowed(account.plan, last.startedAt);
    if (next) return fail(`You can run this again on ${new Date(next).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${account.plan === "free" ? " (once a week on the free plan, daily on the daily plan)" : ""}.`, 429);
  }
  if (website !== account.website) await saveAccount(user.id, { ...account, website });

  const encoder = new TextEncoder();
  const line = (e: unknown) => encoder.encode(`${JSON.stringify(e)}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of findProspects(user.id, account, website, kinds, req.signal)) controller.enqueue(line(event));
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("prospect run failed", err);
          controller.enqueue(line({ type: "error", message: explainClaudeError(err).message }));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});

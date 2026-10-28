import { fail, json, readBody } from "@/lib/http";
import { openLeadShare, respondLeadShare } from "@/lib/leads";

// Public: the link is the credential. No account needed to open a lead.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const lead = openLeadShare((await params).token);
  return lead ? json(lead) : fail("This lead link doesn't exist or has been removed.", 404);
}

/** Body: { answer: "taken" | "passed" }. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const body = await readBody<{ answer?: string }>(req);
  if (body?.answer !== "taken" && body?.answer !== "passed") return fail("Answer taken or passed.");
  const status = respondLeadShare((await params).token, body.answer);
  return status ? json({ status }) : fail("This lead link doesn't exist.", 404);
}

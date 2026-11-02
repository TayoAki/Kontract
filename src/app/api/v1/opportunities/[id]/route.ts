import { openOpportunity } from "@/lib/engine";
import { fail, json } from "@/lib/http";
import { withService } from "@/lib/service-auth";

export const dynamic = "force-dynamic";

/** One open notice with its description. */
export const GET = withService("/api/v1/opportunities/:id", async (_req, _caller, { params }: { params: Promise<{ id: string }> }) => {
  const opportunity = await openOpportunity((await params).id);
  return opportunity ? json({ opportunity }) : fail("No open notice with that id.", 404);
});

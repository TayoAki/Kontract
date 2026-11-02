import { permitRegister } from "@/lib/permits";
import { samDataStatus } from "@/lib/sam-bulk";
import { sledStatus } from "@/lib/sled";

// The one engine API route without a key: is the engine up and loaded?

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const sam = await samDataStatus();
  const feeds = permitRegister();
  const notices = sam?.count ?? 0;
  return Response.json(
    {
      ok: notices > 0,
      samAsOf: sam?.asOf ?? null,
      notices,
      sledBids: sledStatus().count,
      permitFeeds: { ok: feeds.filter((f) => f.health.status === "ok").length, failing: feeds.filter((f) => f.health.status === "failing").length },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

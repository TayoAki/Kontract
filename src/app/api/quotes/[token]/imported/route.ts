import { json, withUser } from "@/lib/http";
import { markImported } from "@/lib/quotes";

/** The app has put this quote into the bid. */
export const POST = withUser(async (_req, user, { params }: { params: Promise<{ token: string }> }) => {
  markImported(user.id, (await params).token);
  return json({ ok: true });
});

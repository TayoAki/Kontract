import { fail, json, readBody, withUser } from "@/lib/http";
import { nextRunAllowed } from "@/lib/prospect-rules";
import { getAccount, getLastRun, getProspect, listProspects, saveProspect } from "@/lib/store";
import type { ProspectStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: ProspectStatus[] = ["new", "contacted", "replied", "won", "dismissed"];

/** Your prospects, the last run, and when the next run is allowed. */
export const GET = withUser(async (_req, user) => {
  const [prospects, lastRun, account] = await Promise.all([listProspects(user.id), getLastRun(user.id), getAccount(user.id)]);
  const counts = lastRun && !lastRun.error && !lastRun.sample;
  return json({ prospects, lastRun, nextRunAt: counts ? nextRunAllowed(account.plan, lastRun.startedAt) : null });
});

/** Change a prospect's status. Body: { id, status }. */
export const PUT = withUser(async (req, user) => {
  const body = await readBody<{ id?: string; status?: ProspectStatus }>(req);
  if (!body?.id || !body.status || !STATUSES.includes(body.status)) return fail("Pick a prospect and a status.");
  const p = await getProspect(user.id, body.id);
  if (!p) return fail("Prospect not found.", 404);
  return json({ prospect: await saveProspect(user.id, { ...p, status: body.status }) });
});

import { updateAccount, type AccountPatch } from "@/lib/accounts";
import { fail, json, readBody, withUser } from "@/lib/http";
import { getAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_req, user) => json({ account: await getAccount(user.id) }));

export const PUT = withUser(async (req, user) => {
  const patch = await readBody<AccountPatch>(req);
  if (!patch || typeof patch !== "object") return fail("Nothing to save.");
  return json({ account: await updateAccount(user.id, patch) });
});

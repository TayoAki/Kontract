import { fail, json, readBody, withUser } from "@/lib/http";
import { getProfile, saveProfile } from "@/lib/store";
import type { CompanyProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_req, user) => json({ profile: await getProfile(user.id) }));

export const PUT = withUser(async (req, user) => {
  const profile = await readBody<CompanyProfile>(req);
  if (!profile || typeof profile !== "object") return fail("Invalid profile");
  return json({ profile: await saveProfile(user.id, profile) });
});

import { fail, json, readBody } from "@/lib/http";
import { getProfile, saveProfile } from "@/lib/store";
import type { CompanyProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ profile: await getProfile() });
}

export async function PUT(req: Request) {
  const profile = await readBody<CompanyProfile>(req);
  if (!profile || typeof profile !== "object") return fail("Invalid profile");
  return json({ profile: await saveProfile(profile) });
}

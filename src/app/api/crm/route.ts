import { fail, json, readBody, withUser } from "@/lib/http";
import { listContacts, saveContact } from "@/lib/store";
import type { CrmContact, CrmStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGES: CrmStage[] = ["found", "contacted", "quoted", "active", "not-a-fit"];

export const GET = withUser(async (_req, user) => json({ contacts: await listContacts(user.id) }));

export const PUT = withUser(async (req, user) => {
  const c = await readBody<CrmContact>(req);
  if (!c?.id || typeof c.company !== "string" || !c.company.trim() || !STAGES.includes(c.stage) || !Array.isArray(c.activities)) {
    return fail("Invalid contact");
  }
  return json({ contact: await saveContact(user.id, { ...c, updatedAt: new Date().toISOString() }) });
});


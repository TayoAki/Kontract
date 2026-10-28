import { json, withUser } from "@/lib/http";
import { deleteDeal } from "@/lib/store";

export const DELETE = withUser(async (_req, user, { params }: { params: Promise<{ id: string }> }) => {
  await deleteDeal(user.id, (await params).id);
  return json({ ok: true });
});

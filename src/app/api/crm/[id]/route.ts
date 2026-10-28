import { json, withUser } from "@/lib/http";
import { deleteContact } from "@/lib/store";

export const DELETE = withUser(async (_req, user, { params }: { params: Promise<{ id: string }> }) => {
  await deleteContact(user.id, (await params).id);
  return json({ ok: true });
});

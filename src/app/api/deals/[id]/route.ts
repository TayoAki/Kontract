import { json } from "@/lib/http";
import { deleteDeal } from "@/lib/store";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await deleteDeal((await params).id);
  return json({ ok: true });
}

import { fail, json, readBody, withUser } from "@/lib/http";
import { samDescription } from "@/lib/sam-bulk";

export const POST = withUser(async (req) => {
  const body = await readBody<{ id?: string }>(req);
  if (!body?.id) return fail("Missing notice id");
  const description = await samDescription(body.id);
  if (description === undefined) return fail("This notice isn't in today's SAM.gov file. It may have closed; open it on SAM.gov.", 404);
  return json({ description });
});

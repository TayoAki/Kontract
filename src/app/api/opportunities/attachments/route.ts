import { fail, json, readBody } from "@/lib/http";
import { fetchAttachments, SamError } from "@/lib/sam";

export async function POST(req: Request) {
  const body = await readBody<{ id?: string; postedDate?: string }>(req);
  if (!body?.id || !body.postedDate) return fail("Missing notice id or posted date");
  try {
    return json({ attachments: await fetchAttachments(body.id, body.postedDate) });
  } catch (err) {
    if (err instanceof SamError) return fail(err.message, err.status === 429 ? 429 : err.status >= 500 ? 502 : 400);
    console.error("attachment lookup failed", err);
    return fail("Couldn't reach SAM.gov. Try again in a moment.", 502);
  }
}

import { fail, json, readBody } from "@/lib/http";
import { fetchDescription, SamError } from "@/lib/sam";

export async function POST(req: Request) {
  const body = await readBody<{ url?: string }>(req);
  if (!body?.url) return fail("Missing description url");
  try {
    return json({ description: await fetchDescription(body.url) });
  } catch (err) {
    if (err instanceof SamError) return fail(err.message, err.status);
    console.error("description fetch failed", err);
    return fail("Couldn't load the description from SAM.gov.", 502);
  }
}

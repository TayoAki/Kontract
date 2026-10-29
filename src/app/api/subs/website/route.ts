import { FirecrawlError } from "@/lib/firecrawl";
import { fail, json, readBody, withUser } from "@/lib/http";
import { readSubWebsite } from "@/lib/sub-website";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Read a business's website for emails, phones, licenses and services. Body: { url }. */
export const POST = withUser(async (req) => {
  const body = await readBody<{ url?: string }>(req);
  if (!body?.url) return fail("Which website?");
  try {
    return json({ facts: await readSubWebsite(body.url) });
  } catch (err) {
    if (err instanceof FirecrawlError) return fail(err.message, err.status);
    console.error("website read failed", err);
    return fail("Couldn't read that website.", 502);
  }
});

import { FirecrawlError } from "@/lib/firecrawl";
import { fail, json, readBody } from "@/lib/http";
import { withService } from "@/lib/service-auth";
import { readSubWebsite } from "@/lib/sub-website";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** A business's website: emails, phones, licenses, services, area (home + contact page, cached a month). */
export const POST = withService("/api/v1/websites/read", async (req) => {
  const body = await readBody<{ url?: string }>(req);
  if (!body?.url) return fail("Which website?");
  try {
    return json({ facts: await readSubWebsite(body.url) });
  } catch (err) {
    if (err instanceof FirecrawlError) return fail(err.message, err.status);
    console.error("v1 website read failed", err);
    return fail("Couldn't read that website.", 502);
  }
});

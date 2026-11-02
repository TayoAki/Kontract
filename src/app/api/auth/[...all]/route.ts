import { toNextJsHandler } from "better-auth/next-js";
import { ensureAuthReady, getAuth } from "@/lib/auth";
import { withNativeLoopbackDefault } from "@/lib/oauth-registration";

export async function GET(req: Request) {
  await ensureAuthReady();
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request) {
  await ensureAuthReady();
  return toNextJsHandler(getAuth()).POST(new URL(req.url).pathname.endsWith("/oauth2/register") ? await labelNativeClient(req) : req);
}

/** MCP client registration: see oauth-registration.ts. */
async function labelNativeClient(req: Request): Promise<Request> {
  const text = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Request(req, { body: text });
  }
  return new Request(req, { body: JSON.stringify(withNativeLoopbackDefault(body)) });
}

import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { ensureAuthReady, getAuth, mcpResource } from "@/lib/auth";

// OpenID discovery for the same OAuth server, for clients that look here first.

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!mcpResource()) return new Response(null, { status: 404 });
  await ensureAuthReady();
  return oauthProviderOpenIdConfigMetadata(getAuth() as never)(req);
}

import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { ensureAuthReady, getAuth, mcpResource } from "@/lib/auth";

// RFC 8414 metadata for the OAuth server that signs AI assistants in (issuer
// /api/auth, so clients ask for /.well-known/oauth-authorization-server/api/auth).

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!mcpResource()) return new Response(null, { status: 404 });
  await ensureAuthReady();
  return oauthProviderAuthServerMetadata(getAuth() as never)(req);
}

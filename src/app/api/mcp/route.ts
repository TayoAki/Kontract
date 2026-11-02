import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { ensureAuthReady, getAuth, mcpResource } from "@/lib/auth";
import { fail } from "@/lib/http";
import { kontractMcpServer } from "@/lib/mcp-tools";

// The MCP server: Streamable HTTP, stateless, serving both the 2026-07-28 and
// the 2025 protocol. Every request needs an OAuth access token issued to this
// URL; the token's subject is the Kontract user the tools act for.

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const mcp = createMcpHandler(
  (ctx) => {
    const userId = ctx.authInfo?.extra?.userId;
    if (typeof userId !== "string") throw new Error("MCP request without a verified user");
    return kontractMcpServer(userId, process.env.BETTER_AUTH_URL!.replace(/\/+$/, ""));
  },
  { legacy: "stateless", onerror: (err) => console.error("mcp:", err.message) },
);

async function handle(req: Request): Promise<Response> {
  const resource = mcpResource();
  if (!resource) return fail("The MCP server needs BETTER_AUTH_URL set to this site's public address.", 503);
  await ensureAuthReady();
  return requireMcpAuth(
    getAuth() as never,
    (request, claims) => {
      if (typeof claims.sub !== "string" || !claims.sub) return fail("Sign in again.", 401);
      const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
      const clientId = String(claims.azp ?? claims.client_id ?? "");
      return mcp.fetch(request, { authInfo: { token: "", clientId, scopes, resource: new URL(resource), extra: { userId: claims.sub } } });
    },
    { resource },
  )(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

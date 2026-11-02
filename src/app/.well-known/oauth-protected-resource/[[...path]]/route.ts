import { ensureAuthReady, getAuth, mcpResource } from "@/lib/auth";

// RFC 9728 metadata for the MCP server (/api/mcp): where its tokens come from.
// The MCP auth plugin answers it; Next routes the root path here.

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!mcpResource()) return new Response(null, { status: 404 });
  await ensureAuthReady();
  return getAuth().handler(req);
}

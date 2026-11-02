// Dynamic client registration (RFC 7591) for MCP clients. A client that only
// redirects to an http loopback address (localhost, 127.0.0.1, [::1]) is a
// native app per RFC 8252, but some CLI clients don't say so, and Better Auth
// treats an unlabelled client as a web app that needs https. Label it.

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

export function withNativeLoopbackDefault(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as { application_type?: unknown; redirect_uris?: unknown };
  if (b.application_type !== undefined || !Array.isArray(b.redirect_uris) || b.redirect_uris.length === 0) return body;
  return b.redirect_uris.every((u) => typeof u === "string" && LOOPBACK.test(u)) ? { ...b, application_type: "native" } : body;
}

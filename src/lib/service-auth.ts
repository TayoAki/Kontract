import { createHash, timingSafeEqual } from "node:crypto";
import { meter } from "./cost-meter.ts";
import { createLimiter } from "./rate-limit.ts";

// The engine API (/api/v1) is for another server (Magpie), not people: it
// authenticates with a service key, never a session cookie, and names the
// customer workspace it's acting for so usage can be billed to it. Keys come
// from KONTRACT_SERVICE_KEYS (comma-separated, so one can be rotated in
// while the old one still works).

export interface ServiceCaller {
  /** The calling workspace, e.g. "magpie-acme" ("" only on routes that don't need one). */
  workspaceId: string;
  /** Count a Claude call against the workspace's per-minute Claude limit. Returns a 429 to send back when over it. */
  claudeLimit(): Response | null;
}

const WORKSPACE = /^[a-z0-9-]{1,64}$/;
const MIN_KEY_LENGTH = 32;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** The configured keys, hashed. Keys shorter than 32 characters are ignored. */
export function serviceKeys(env: string | undefined = process.env.KONTRACT_SERVICE_KEYS): Buffer[] {
  return (env ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= MIN_KEY_LENGTH)
    .map(sha256);
}

/**
 * Check the bearer key against every configured key in constant time (both
 * sides hashed, no early exit) and read the workspace. Null when anything is
 * wrong; the caller answers with one generic 401 either way.
 */
export function authorizeService(req: Request, keys: Buffer[], requireWorkspace = true): { workspaceId: string } | null {
  const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const given = sha256(token ?? "");
  let match = false;
  for (const k of keys) match = timingSafeEqual(given, k) || match;
  if (!token || !match) return null;
  const workspaceId = req.headers.get("x-workspace-id") ?? "";
  if (requireWorkspace ? !WORKSPACE.test(workspaceId) : workspaceId !== "" && !WORKSPACE.test(workspaceId)) return null;
  return { workspaceId };
}

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

const unauthorized = () => respond(401, { error: "Unauthorized." });
const tooMany = (seconds: number) => respond(429, { error: "Too many requests. Slow down and try again." }, { "Retry-After": String(seconds) });

// Per workspace, per server process.
const allCalls = createLimiter(60, 60_000);
const claudeCalls = createLimiter(10, 60_000);

type Recorder = (row: { workspaceId: string; endpoint: string; costMicro: number; status: number }) => void;
const record: Recorder = (row) => {
  void import("./service-usage.ts").then((m) => m.recordServiceCall(row)).catch((err) => console.error("usage record failed", err));
};

/**
 * Wrap an engine API handler: service key and workspace, rate limits, a cost
 * meter around the work (X-Kontract-Cost-Micro), no-store, and one usage row
 * per call. `endpoint` is the route pattern, e.g. "/api/v1/opportunities/:id".
 * A streamed (NDJSON) response is recorded when the stream ends, with what it
 * spent; its cost travels in the stream's last event instead of a header.
 */
export function withService<A extends unknown[]>(
  endpoint: string,
  handler: (req: Request, caller: ServiceCaller, ...rest: A) => Promise<Response> | Response,
  opts: { workspace?: "required" | "optional" } = {},
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    const auth = authorizeService(req, serviceKeys(), opts.workspace !== "optional");
    if (!auth) return unauthorized();
    const { workspaceId } = auth;
    const log = (status: number, costMicro: number) => workspaceId && record({ workspaceId, endpoint, costMicro, status });

    const wait = workspaceId ? allCalls.take(workspaceId) : null;
    if (wait != null) {
      log(429, 0);
      return tooMany(wait);
    }
    const caller: ServiceCaller = {
      workspaceId,
      claudeLimit() {
        const w = claudeCalls.take(workspaceId || "-");
        return w == null ? null : tooMany(w);
      },
    };

    const { result, tally } = meter(async () => handler(req, caller, ...rest));
    let res: Response;
    try {
      res = await result;
    } catch (err) {
      console.error(`engine API ${endpoint} failed`, err);
      res = respond(500, { error: "Something went wrong. Try again." });
    }

    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    if (res.body && headers.get("content-type")?.includes("ndjson")) {
      const done = new TransformStream<Uint8Array, Uint8Array>({ flush: () => void log(res.status, tally.micro) });
      return new Response(res.body.pipeThrough(done), { status: res.status, headers });
    }
    headers.set("X-Kontract-Cost-Micro", String(tally.micro));
    log(res.status, tally.micro);
    return new Response(res.body, { status: res.status, headers });
  };
}

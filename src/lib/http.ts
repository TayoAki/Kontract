import "server-only";
import { requireUser, UnauthorizedError, type SessionUser } from "./auth";

export function json(data: unknown, init?: number | ResponseInit): Response {
  const opts = typeof init === "number" ? { status: init } : init;
  return Response.json(data, { ...opts, headers: { "Cache-Control": "no-store", ...opts?.headers } });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function readBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Wrap a route handler so it only runs for a signed-in user. */
export function withUser<A extends unknown[]>(
  handler: (req: Request, user: SessionUser, ...rest: A) => Promise<Response> | Response,
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    let user: SessionUser;
    try {
      user = await requireUser(req);
    } catch (err) {
      if (err instanceof UnauthorizedError) return fail(err.message, 401);
      throw err;
    }
    return handler(req, user, ...rest);
  };
}

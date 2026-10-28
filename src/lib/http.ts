import "server-only";

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

import { toNextJsHandler } from "better-auth/next-js";
import { ensureAuthReady, getAuth } from "@/lib/auth";

export async function GET(req: Request) {
  await ensureAuthReady();
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request) {
  await ensureAuthReady();
  return toNextJsHandler(getAuth()).POST(req);
}

import { fail, json, withUser } from "@/lib/http";
import { PermitError, searchPermits } from "@/lib/permits";
import { TRADES } from "@/lib/permit-trades";
import type { PermitQuery, SignalStrength, TradeId } from "@/lib/types";

export const dynamic = "force-dynamic";

const STRENGTHS: SignalStrength[] = ["strong", "likely", "possible"];
const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export const GET = withUser(async (req) => {
  const p = new URL(req.url).searchParams;
  const trade = p.get("trade") as TradeId | null;
  const q: PermitQuery = {
    state: p.get("state")?.toUpperCase() || undefined,
    market: p.get("market") || undefined,
    days: num(p.get("days")) ?? 7,
    trade: trade && TRADES.some((t) => t.id === trade) ? trade : undefined,
    minValue: num(p.get("minValue")),
    residentialOnly: p.get("residentialOnly") === "1",
    q: p.get("q") || undefined,
    zip: p.get("zip")?.match(/^\d{5}$/)?.[0],
    leadsOnly: p.get("leadsOnly") === "1",
    minStrength: STRENGTHS.find((x) => x === p.get("minStrength")),
  };
  try {
    return json(await searchPermits(q));
  } catch (err) {
    if (err instanceof PermitError) return fail(err.message, 400);
    console.error("permit search failed", err);
    return fail("Permit search failed. Try again.", 500);
  }
});

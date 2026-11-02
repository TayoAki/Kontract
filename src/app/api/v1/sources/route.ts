import { json } from "@/lib/http";
import { PERMIT_MARKETS, STATE_NAMES } from "@/lib/permit-sources";
import { TRADES, WORK } from "@/lib/permit-trades";
import { permitRegister } from "@/lib/permits";
import { withService } from "@/lib/service-auth";
import { bidRegister } from "@/lib/sled";

export const dynamic = "force-dynamic";

/** Permit and bid feeds with health, the states and markets they cover, trades and kinds of work. */
export const GET = withService("/api/v1/sources", async () => {
  const states = [...new Set(PERMIT_MARKETS.map((m) => m.state))]
    .sort((a, b) => (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b))
    .map((code) => ({ code, name: STATE_NAMES[code] ?? code, markets: PERMIT_MARKETS.filter((m) => m.state === code).length }));
  return json({ states, markets: PERMIT_MARKETS, feeds: permitRegister(), bidFeeds: bidRegister(), trades: TRADES, work: WORK });
});

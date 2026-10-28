import { json, withUser } from "@/lib/http";
import { PERMIT_MARKETS, STATE_NAMES } from "@/lib/permit-sources";
import { TRADES, WORK } from "@/lib/permit-trades";
import { permitRegister } from "@/lib/permits";
import { bidRegister } from "@/lib/sled";

export const dynamic = "force-dynamic";

/** States, markets (cities/counties), the source register with health, and trades. */
export const GET = withUser(async () => {
  const states = [...new Set(PERMIT_MARKETS.map((m) => m.state))]
    .sort((a, b) => (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b))
    .map((code) => ({ code, name: STATE_NAMES[code] ?? code, markets: PERMIT_MARKETS.filter((m) => m.state === code).length }));
  return json({ states, markets: PERMIT_MARKETS, feeds: permitRegister(), bidFeeds: bidRegister(), trades: TRADES, work: WORK });
});

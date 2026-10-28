import { json, withUser } from "@/lib/http";
import { PERMIT_SOURCES, STATE_NAMES } from "@/lib/permit-sources";
import { TRADES } from "@/lib/permit-trades";

export const GET = withUser(async () => {
  const states = [...new Set(PERMIT_SOURCES.map((s) => s.state))]
    .sort((a, b) => (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b))
    .map((code) => ({ code, name: STATE_NAMES[code] ?? code, sources: PERMIT_SOURCES.filter((s) => s.state === code).length }));
  return json({
    states,
    sources: PERMIT_SOURCES.map(({ id, name, state, kind, datasetUrl }) => ({ id, name, state, kind, datasetUrl })),
    trades: TRADES,
  });
});

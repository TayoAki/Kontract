import { AsyncLocalStorage } from "node:async_hooks";

// A running total of what one engine API request spent. The request runs
// inside meter(); paid calls anywhere below it (Claude, Places, Apify,
// Firecrawl) report with addCost(). Outside a meter, addCost does nothing, so
// the app's own screens aren't affected, and cached results cost nothing
// because they never reach the paid call.

interface Tally {
  micro: number;
}

const als = new AsyncLocalStorage<Tally>();

/** Run `fn` with a fresh tally; read it with spentMicro() inside, or from the returned tally after. */
export function meter<T>(fn: () => T): { result: T; tally: Tally } {
  const tally: Tally = { micro: 0 };
  return { result: als.run(tally, fn), tally };
}

export function addCost(micro: number): void {
  const t = als.getStore();
  if (t && Number.isFinite(micro) && micro > 0) t.micro += Math.round(micro);
}

/** What the current request has spent so far (0 outside a meter). */
export function spentMicro(): number {
  return als.getStore()?.micro ?? 0;
}

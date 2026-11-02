// What paid lookups cost, in micro-dollars (millionths of a dollar), so the
// engine API can bill each call (X-Kontract-Cost-Micro). Claude is priced from
// the tokens a response actually used; the others from per-call list prices,
// each overridable by env var when a plan's rate differs.

/** Claude list prices in dollars per million tokens, which is micro-dollars per token. */
interface ClaudePrice {
  input: number;
  output: number;
  cacheRead: number;
}

// Longest prefix first: "claude-opus-5-5" before "claude-opus-5".
const CLAUDE: [prefix: string, price: ClaudePrice][] = [
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-mythos-5-1", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-fable-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-mythos-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheRead: 0.01 }],
];
// An unknown model is billed at the top tier rather than under-billed.
const UNKNOWN: ClaudePrice = { input: 10, output: 50, cacheRead: 1 };

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function claudePrice(model: string): ClaudePrice {
  const id = model.toLowerCase();
  const price = CLAUDE.find(([prefix]) => id === prefix || id.startsWith(`${prefix}-`))?.[1] ?? UNKNOWN;
  return price;
}

/** What one Claude response cost. Cache writes are 1.25x input (5-minute TTL). */
export function claudeCostMicro(model: string, usage: ClaudeUsage): number {
  let p = claudePrice(model);
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  // Haiku 5.5 costs 5x more on prompts over 100K tokens.
  if (model.startsWith("claude-haiku-5-5") && usage.input_tokens + write + read > 100_000) p = { input: 0.5, output: 2.5, cacheRead: 0.05 };
  return Math.round(usage.input_tokens * p.input + usage.output_tokens * p.output + write * p.input * 1.25 + read * p.cacheRead);
}

function envMicro(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
}

/** One Google Places Text Search with phone, website and rating fields (the Enterprise SKU, $35 per 1,000). */
export const placesSearchCostMicro = () => envMicro("PLACES_SEARCH_COST_MICRO", 35_000);

/** One Apify Google Maps run: a start fee plus each place scraped. */
export const apifyCostMicro = (places: number) => envMicro("APIFY_RUN_COST_MICRO", 7_000) + places * envMicro("APIFY_PLACE_COST_MICRO", 4_000);

/** Firecrawl pages, one credit each by default (a Standard-plan credit is about $0.001). */
export const firecrawlCostMicro = (credits: number) => credits * envMicro("FIRECRAWL_CREDIT_COST_MICRO", 1_000);

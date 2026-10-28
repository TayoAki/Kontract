import "server-only";
import { isServiceCode } from "./fit-score";
import { annualize, awardYears, pricingStats } from "./pricing-stats";
import { cached } from "./store";
import type { PastAward, PricingQuery, PricingResults } from "./types";

// USAspending.gov award search. Free, no API key.
// Docs: https://api.usaspending.gov/docs/endpoints

const AWARD_SEARCH = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const TTL = 12 * 60 * 60 * 1000;
const CONTRACT_TYPES = ["A", "B", "C", "D"]; // BPA call, purchase order, delivery order, definitive contract

const FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Awarding Agency",
  "Awarding Sub Agency",
  "Start Date",
  "End Date",
  "Description",
  "NAICS",
  "PSC",
  "Place of Performance State Code",
  "generated_internal_id",
];

interface Row {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Award Amount"?: number;
  "Awarding Agency"?: string;
  "Awarding Sub Agency"?: string;
  "Start Date"?: string | null;
  "End Date"?: string | null;
  Description?: string | null;
  NAICS?: { code?: string } | string | null;
  PSC?: { code?: string } | string | null;
  "Place of Performance State Code"?: string | null;
  generated_internal_id?: string;
  internal_id?: number;
}

const code = (v: Row["NAICS"]) => (typeof v === "string" ? v : (v?.code ?? null));
const norm = (s: string | undefined | null) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export class PricingError extends Error {}

export async function searchPastAwards(query: PricingQuery, context?: { agency?: string; state?: string }): Promise<PricingResults> {
  const keywords = query.keywords.map((k) => k.trim()).filter((k) => k.length >= 3);
  if (keywords.length === 0) throw new PricingError("Enter a keyword of at least 3 characters.");

  const today = new Date();
  const start = new Date(today);
  start.setFullYear(today.getFullYear() - Math.min(Math.max(query.yearsBack ?? 6, 1), 15));
  const filters: Record<string, unknown> = {
    keywords,
    award_type_codes: CONTRACT_TYPES,
    time_period: [{ start_date: start.toISOString().slice(0, 10), end_date: today.toISOString().slice(0, 10) }],
  };
  if (query.naics) filters.naics_codes = { require: [query.naics] };
  if (query.state) filters.place_of_performance_locations = [{ country: "USA", state: query.state }];
  if (query.agency) filters.agencies = [{ type: "awarding", tier: "toptier", name: query.agency }];

  const body = { filters, fields: FIELDS, limit: 100, page: 1, sort: "Start Date", order: "desc" };
  const rows = await cached(`usa:${JSON.stringify(body)}`, TTL, async () => {
    const res = await fetch(AWARD_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new PricingError(`USAspending error ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return ((await res.json()) as { results?: Row[] }).results ?? [];
  });

  const ctxAgency = norm(context?.agency);
  const awards: PastAward[] = rows
    .map((r): PastAward => {
      const amount = r["Award Amount"] ?? 0;
      const startDate = r["Start Date"] ?? null;
      const endDate = r["End Date"] ?? null;
      const years = awardYears(startDate, endDate);
      const agency = r["Awarding Agency"] ?? "";
      const state = r["Place of Performance State Code"] ?? null;
      return {
        id: r.generated_internal_id ?? String(r.internal_id ?? r["Award ID"]),
        awardId: r["Award ID"] ?? "",
        recipient: r["Recipient Name"] ?? "Unknown",
        amount,
        annualAmount: annualize(amount, years),
        agency,
        subAgency: r["Awarding Sub Agency"] ?? "",
        startDate,
        endDate,
        years,
        description: r.Description ?? "",
        naics: code(r.NAICS),
        psc: code(r.PSC),
        state,
        url: r.generated_internal_id ? `https://www.usaspending.gov/award/${r.generated_internal_id}` : "https://www.usaspending.gov/search",
        likelyRelated: Boolean(ctxAgency && norm(agency) === ctxAgency && context?.state && state === context.state),
      };
    })
    .filter((a) => a.amount > 0)
    .filter((a) => !query.servicesOnly || isServiceCode(a.psc) !== false);

  awards.sort((a, b) => Number(b.likelyRelated) - Number(a.likelyRelated));
  return { awards, stats: pricingStats(awards), query: { ...query, keywords } };
}

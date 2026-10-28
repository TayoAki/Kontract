import { uid } from "./format.ts";
import { rulesBreakdown } from "./rules.ts";
import type { Breakdown, Deal, Opportunity, PricingModel, Stage } from "./types.ts";

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "found", label: "Found", hint: "Worth a closer look" },
  { id: "sourcing", label: "Finding subs", hint: "Scope sent, calling subcontractors" },
  { id: "quoted", label: "Quote in hand", hint: "Have a sub's price, writing the bid" },
  { id: "submitted", label: "Submitted", hint: "Waiting on the award" },
  { id: "won", label: "Won", hint: "Past performance!" },
  { id: "lost", label: "Lost", hint: "Check who won and for how much" },
];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

export const OPEN_STAGES: Stage[] = ["found", "sourcing", "quoted"];

export function pricingFromBreakdown(b: Breakdown): PricingModel {
  const periods = b.periods && b.periods > 0 ? Math.round(b.periods) : 1;
  return {
    periods,
    periodLabel: periods > 1 ? "year" : "contract",
    lines: b.suggestedLines.map((l) => ({
      id: uid("line"),
      description: l.description,
      unit: l.unit,
      quantity: l.quantityPerPeriod,
      subCost: 0,
      price: 0,
    })),
  };
}

export function newDeal(opportunity: Opportunity, breakdown?: Breakdown, now: Date = new Date()): Deal {
  const b = breakdown ?? rulesBreakdown(opportunity, now);
  const ts = now.toISOString();
  return {
    id: opportunity.id,
    opportunity,
    stage: "found",
    createdAt: ts,
    updatedAt: ts,
    notes: "",
    breakdown,
    subs: [],
    pricing: pricingFromBreakdown(b),
  };
}

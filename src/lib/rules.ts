import { daysUntil, formatDate, placeLabel } from "./format.ts";
import { fitScore, isServiceCode } from "./fit-score.ts";
import type { Breakdown, Opportunity } from "./types.ts";

// Deterministic, no-API fallbacks: used when Claude isn't configured, and to
// seed search terms for past pricing and subcontractor lookups.

interface Category {
  match: RegExp;
  who: string;
  terms: string[];
  awardKeywords: string[];
  pricing: string;
  lines: { description: string; unit: string; quantityPerPeriod: number }[];
}

const CATEGORIES: Category[] = [
  {
    match: /hazardous|haz ?mat|formalin|chemical waste|medical waste|waste (pickup|disposal|removal)|universal waste/i,
    who: "A licensed hazardous-waste hauler / disposal company",
    terms: ["hazardous waste disposal", "chemical waste pickup", "medical waste disposal"],
    awardKeywords: ["hazardous waste", "waste disposal"],
    pricing: "Per pickup (or per drum), times pickups per year",
    lines: [{ description: "Waste pickup & disposal", unit: "pickup", quantityPerPeriod: 12 }],
  },
  {
    match: /cater|meals?\b|food service|field feeding|dining|boxed lunch/i,
    who: "A catering company that can deliver and clean up on site",
    terms: ["catering company", "event catering", "corporate catering"],
    awardKeywords: ["catering", "meals"],
    pricing: "Per person, per meal",
    lines: [
      { description: "Breakfast", unit: "meal", quantityPerPeriod: 100 },
      { description: "Lunch", unit: "meal", quantityPerPeriod: 100 },
      { description: "Dinner", unit: "meal", quantityPerPeriod: 100 },
    ],
  },
  {
    match: /landscap|grounds|mowing|lawn|turf|irrigation/i,
    who: "A commercial landscaping / grounds maintenance company",
    terms: ["commercial landscaping", "grounds maintenance", "lawn care service"],
    awardKeywords: ["grounds maintenance", "landscaping"],
    pricing: "Monthly service fee (sometimes per acre or per visit)",
    lines: [{ description: "Grounds maintenance", unit: "month", quantityPerPeriod: 12 }],
  },
  {
    match: /janitor|custodial|cleaning|housekeeping/i,
    who: "A commercial cleaning / janitorial company",
    terms: ["commercial cleaning company", "janitorial service", "office cleaning"],
    awardKeywords: ["janitorial", "custodial"],
    pricing: "Monthly fee (often priced per square foot)",
    lines: [{ description: "Janitorial service", unit: "month", quantityPerPeriod: 12 }],
  },
  {
    match: /paint/i,
    who: "A commercial painting contractor",
    terms: ["commercial painting contractor", "painting company", "industrial painting"],
    awardKeywords: ["painting"],
    pricing: "Lump sum for the job (subs usually quote per square foot)",
    lines: [{ description: "Painting (complete job)", unit: "job", quantityPerPeriod: 1 }],
  },
  {
    match: /snow|ice removal|de-?icing/i,
    who: "A snow plowing / removal company",
    terms: ["snow removal", "snow plowing service", "commercial snow removal"],
    awardKeywords: ["snow removal"],
    pricing: "Per event or per season",
    lines: [{ description: "Snow removal", unit: "event", quantityPerPeriod: 20 }],
  },
  {
    match: /pest|termite|rodent|exterminat/i,
    who: "A commercial pest control company",
    terms: ["pest control", "commercial pest control", "exterminator"],
    awardKeywords: ["pest control"],
    pricing: "Monthly service",
    lines: [{ description: "Pest control service", unit: "month", quantityPerPeriod: 12 }],
  },
  {
    match: /portable (toilet|restroom|latrine)|porta|sanitation units?|hand ?wash/i,
    who: "A portable toilet rental company",
    terms: ["portable toilet rental", "porta potty rental", "portable restroom service"],
    awardKeywords: ["portable toilet", "portable latrine"],
    pricing: "Per unit, per month (includes servicing)",
    lines: [{ description: "Portable toilet (serviced weekly)", unit: "unit-month", quantityPerPeriod: 24 }],
  },
  {
    match: /hvac|air condition|heating|boiler|chiller|refrigeration/i,
    who: "A commercial HVAC contractor",
    terms: ["commercial HVAC contractor", "HVAC maintenance", "boiler service"],
    awardKeywords: ["HVAC maintenance", "preventive maintenance"],
    pricing: "Per preventive-maintenance visit (often quarterly), plus repairs",
    lines: [{ description: "Preventive maintenance visit", unit: "visit", quantityPerPeriod: 4 }],
  },
  {
    match: /elevator|escalator/i,
    who: "An elevator maintenance company",
    terms: ["elevator maintenance", "elevator service company"],
    awardKeywords: ["elevator maintenance"],
    pricing: "Monthly maintenance fee",
    lines: [{ description: "Elevator maintenance", unit: "month", quantityPerPeriod: 12 }],
  },
  {
    match: /shred|document destruction/i,
    who: "A document shredding company",
    terms: ["document shredding service", "secure shredding"],
    awardKeywords: ["shredding"],
    pricing: "Per pickup or per bin",
    lines: [{ description: "Shredding pickup", unit: "pickup", quantityPerPeriod: 24 }],
  },
  {
    match: /tree (trimming|removal|service)|arborist/i,
    who: "A tree service / arborist",
    terms: ["tree service", "arborist", "tree removal"],
    awardKeywords: ["tree trimming", "tree removal"],
    pricing: "Lump sum or per tree",
    lines: [{ description: "Tree work", unit: "job", quantityPerPeriod: 1 }],
  },
  {
    match: /fire (alarm|extinguisher|sprinkler|suppression)/i,
    who: "A fire protection company",
    terms: ["fire protection company", "fire extinguisher inspection", "fire alarm inspection"],
    awardKeywords: ["fire alarm", "fire extinguisher"],
    pricing: "Per inspection (usually annual or semi-annual)",
    lines: [{ description: "Inspection & testing", unit: "inspection", quantityPerPeriod: 2 }],
  },
  {
    match: /roof/i,
    who: "A commercial roofing contractor",
    terms: ["commercial roofing contractor", "roof repair"],
    awardKeywords: ["roofing", "roof repair"],
    pricing: "Lump sum for the job",
    lines: [{ description: "Roofing work", unit: "job", quantityPerPeriod: 1 }],
  },
  {
    match: /moving|relocation|furniture (install|moving)/i,
    who: "A commercial moving company",
    terms: ["commercial moving company", "office movers"],
    awardKeywords: ["moving services"],
    pricing: "Per move or hourly crew rate",
    lines: [{ description: "Moving crew", unit: "hour", quantityPerPeriod: 40 }],
  },
  {
    match: /security guard|guard service|armed guard|unarmed guard/i,
    who: "A licensed security guard company",
    terms: ["security guard company", "security services"],
    awardKeywords: ["guard services"],
    pricing: "Hourly rate per guard",
    lines: [{ description: "Guard hours", unit: "hour", quantityPerPeriod: 2080 }],
  },
  {
    match: /laundry|linen/i,
    who: "A commercial laundry / linen service",
    terms: ["commercial laundry service", "linen service"],
    awardKeywords: ["laundry"],
    pricing: "Per pound or per piece",
    lines: [{ description: "Laundry", unit: "lb", quantityPerPeriod: 5000 }],
  },
];

const STOP = new Set(
  "a an and at for of the to in on with by from services service contract contracts requirement requirements support fy fy25 fy26 fy27 fy28 base year years option options annual multi various new project".split(
    " ",
  ),
);

/** Main part of a notice title, without solicitation numbers or trailing location. */
export function cleanTitle(title: string): string {
  const first = title.split(/\s[-–—|:]\s|\s\(|:\s/)[0] ?? title;
  return first
    .replace(/\b[A-Z0-9]{2,}-?\d{2,}[A-Z0-9-]*\b/g, " ")
    .replace(/[^A-Za-z0-9&/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWords(title: string): string[] {
  return cleanTitle(title)
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

function categoryFor(o: Pick<Opportunity, "title" | "description">): Category | null {
  const hay = `${o.title} ${o.title} ${(o.description ?? "").slice(0, 3000)}`;
  // Title matches win over description matches.
  return CATEGORIES.find((c) => c.match.test(o.title)) ?? CATEGORIES.find((c) => c.match.test(hay)) ?? null;
}

/** Search phrases to look up past awards on USAspending. Each is at least 3 characters. */
export function awardKeywords(o: Pick<Opportunity, "title" | "description">): string[] {
  const cat = categoryFor(o);
  if (cat) return cat.awardKeywords;
  const words = titleWords(o.title);
  if (words.length === 0) return [cleanTitle(o.title).slice(0, 60) || o.title];
  return [words.slice(0, 2).join(" ")];
}

/** What to type into Google Maps to find a subcontractor. */
export function subSearchTerms(o: Pick<Opportunity, "title" | "description">): string[] {
  const cat = categoryFor(o);
  if (cat) return cat.terms;
  const words = titleWords(o.title);
  return [words.slice(0, 3).join(" ") || cleanTitle(o.title)];
}

/** Guess contract length in periods (years) from the description. */
export function guessPeriods(text: string | undefined): { periods: number | null; label: string } {
  if (!text) return { periods: null, label: "Check the notice for the period of performance" };
  const t = text.toLowerCase();
  // e.g. "a base year plus four (4) one-year option periods", "4 option years"
  const optionYears = t.match(/\b(\d|one|two|three|four|five|six|seven|eight|nine)\s*(?:\(\d\)\s*)?(?:one-year\s+|1-year\s+|12-month\s+)?option (?:years|periods)/);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  if (/base (year|period)/.test(t) && optionYears) {
    const raw = optionYears[1]!;
    const n = words[raw] ?? Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n < 10) return { periods: n + 1, label: `1 base year + ${n} option years` };
  }
  const span = t.match(/(\d+|one|two|three|four|five)[\s-]*(?:\(\d\)\s*)?year (?:contract|period|performance|term)/);
  if (span) {
    const n = words[span[1]!] ?? Number.parseInt(span[1]!, 10);
    if (Number.isFinite(n) && n > 0 && n < 11) return { periods: n, label: `${n}-year contract` };
  }
  const weeks = t.match(/(\d+|one|two|three)[\s-]*weeks?/);
  if (weeks) return { periods: 1, label: `One-time job (~${weeks[1]} week${weeks[1] === "one" || weeks[1] === "1" ? "" : "s"})` };
  return { periods: null, label: "Check the notice for the period of performance" };
}

const REQUIREMENT_HINTS: [RegExp, string][] = [
  [/licen[cs]e/i, "State or local license for this trade"],
  [/insurance|liability/i, "Proof of insurance (general liability, often workers' comp)"],
  [/background check|security clearance|base access|dbids|escort/i, "Background checks / base access for workers"],
  [/\bepa\b|dot\b|manifest/i, "EPA / DOT compliance (manifests, permits)"],
  [/osha/i, "OSHA safety compliance"],
  [/wage determination|service contract (act|labor)/i, "Pay at least the posted wage determination rates"],
  [/past performance/i, "Past performance references"],
  [/site visit/i, "Site visit (check whether it's mandatory)"],
  [/bond/i, "Bid or performance bond"],
  [/servsafe|food handler|health permit/i, "Food-safety certification"],
];

export function scanRequirements(text: string | undefined): string[] {
  if (!text) return [];
  return REQUIREMENT_HINTS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export function rulesBreakdown(o: Opportunity, now: Date = new Date()): Breakdown {
  const cat = categoryFor(o);
  const service = isServiceCode(o.pscCode);
  const fit = fitScore(o, now);
  const days = daysUntil(o.responseDeadline, now);
  const len = guessPeriods(o.description);
  const what = cleanTitle(o.title).toLowerCase() || "this work";
  const place = placeLabel(o.placeOfPerformance);

  const redFlags: string[] = [];
  if (service === false) redFlags.push("It's a product, not a service. You'd need a manufacturer or distributor.");
  if (o.attachments.length >= 10) redFlags.push(`${o.attachments.length} attachments. Expect a long, technical package.`);
  if (days != null && days >= 0 && days < 7) redFlags.push(`Only ${days} day${days === 1 ? "" : "s"} left to get a sub's quote.`);
  if (/mandatory site visit/i.test(o.description ?? "")) redFlags.push("Mandatory site visit. Someone has to attend in person.");
  if (/security clearance/i.test(o.description ?? "")) redFlags.push("Security clearance required.");
  if (/\bbond\b/i.test(o.description ?? "")) redFlags.push("Bonding required. Check that your sub can provide it.");

  const unit = cat?.lines[0]?.unit ?? "unit";
  return {
    plainEnglish: `${o.office || o.agency} needs ${what} in ${place}.${
      o.responseDeadline ? ` Responses are due ${formatDate(o.responseDeadline)}${days != null && days >= 0 ? ` (${days} days)` : ""}.` : ""
    }`,
    workType: service === false ? "product" : "service",
    whoDoesTheWork: cat?.who ?? `A local company that does ${what}`,
    subcontractorSearchTerms: subSearchTerms(o),
    pricingStructure: cat?.pricing ?? "Check the price schedule in the attachments (lump sum or per unit)",
    suggestedLines: cat?.lines ?? [{ description: cleanTitle(o.title) || "Work as described", unit: "job", quantityPerPeriod: 1 }],
    contractLength: len.label,
    periods: len.periods,
    keyRequirements: scanRequirements(o.description),
    questionsForSubs: [
      `Can you do this work in ${place} on the schedule in the scope of work?`,
      `What's your price per ${unit}, all-in (labor, travel, disposal, fees)?`,
      "Are you OK being paid net-30 after each job is completed and invoiced?",
      "Can you share 2–3 similar jobs you've done (for past performance)?",
      "Do you have the licenses and insurance this job requires?",
    ],
    redFlags,
    difficulty: fit.score >= 75 ? "easy" : fit.score >= 50 ? "moderate" : "hard",
    source: "rules",
  };
}

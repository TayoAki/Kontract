import { bidTotals } from "./bid-math.ts";
import { addDays, daysUntil, formatDate, money, placeLabel } from "./format.ts";
import { cleanTitle, rulesBreakdown } from "./rules.ts";
import type { CompanyProfile, Deal, Subcontractor } from "./types.ts";

// Fill-in-the-blank drafts used when Claude isn't configured. Anything in
// [brackets] needs the user's input.

const or = (v: string | undefined, placeholder: string) => (v && v.trim() ? v.trim() : `[${placeholder}]`);
/** The values that are filled in, for lines where a missing piece can just be left out. */
const filled = (...vs: (string | undefined)[]) => vs.map((v) => v?.trim()).filter((v): v is string => Boolean(v));

/** Ask subs for quotes a few days before the government's deadline. */
export function quoteDueDate(deadline: string | null, now: Date = new Date()): string {
  const days = daysUntil(deadline, now);
  if (days == null) return "[quote due date]";
  const lead = days > 10 ? 4 : days > 5 ? 2 : 1;
  return formatDate(addDays(new Date(deadline!), -lead).toISOString(), { weekday: "long" });
}

const plural = (n: number, unit: string) => (n === 1 || /s$/.test(unit) ? unit : `${unit}s`);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Kept as capitals when a title in all capitals is turned into a sentence.
const ACRONYMS = new Set(["HVAC", "VA", "VAMC", "CBOC", "US", "USA", "USDA", "USACE", "USFS", "USFWS", "NPS", "BLM", "FAA", "DOD", "DOE", "GSA", "IHS", "NASA", "NOAA", "ADA", "LED", "IT", "AV", "UPS", "EMS", "PPE", "OSHA", "II", "III", "IV"]);

/**
 * A title as written: names like "Swan Lake Ranger District" or "Building 347"
 * stay capitalized. Titles in all capitals, common on SAM.gov, become sentence
 * case, keeping the acronyms they're known to have (HVAC, VA).
 */
export function sentenceCase(title: string): string {
  if (/[a-z]/.test(title)) return title;
  return title
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const out = /\d/.test(w) || ACRONYMS.has(w.replace(/[^A-Z]/g, "")) ? w : w.toLowerCase();
      return i === 0 ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    })
    .join(" ");
}

/** "1 base year + 2 option years" → "It runs 1 base year + 2 option years." Nothing when the notice doesn't say. */
function lengthSentence(label: string): string {
  if (/^check the notice/i.test(label)) return "";
  return /^\d+ base/.test(label) ? `It runs ${label}.` : `It's a ${lowerFirst(label)}.`;
}

/** "commercial cleaning company" → "commercial cleaning": the trade, not the business. */
function tradeOf(term: string | undefined): string {
  return term ? term.replace(/\s+(?:company|companies|contractors?|services?)$/i, "") : "";
}

/** Neutral description of the work, safe to send to subs or the government. */
export function workSummary(deal: Deal, now: Date = new Date()): string {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const what = sentenceCase(cleanTitle(o.title)) || "The work described";
  const per = deal.pricing.periodLabel === "year" ? " per year" : "";
  // "1 job" says nothing; only real quantities (40 visits, 12 months) are worth stating.
  const qty = deal.pricing.lines
    .filter((l) => l.quantity > 0 && !(l.quantity === 1 && /^(job|lump sum|ls|each)$/i.test(l.unit)))
    .map((l) => `${l.quantity.toLocaleString()} ${plural(l.quantity, l.unit)}${per}`)
    .join(", ");
  const term = /^check the notice/i.test(b.contractLength) ? "" : ` Term: ${lowerFirst(b.contractLength)}.`;
  return `${what} in ${placeLabel(o.placeOfPerformance)}${qty ? `, estimated at ${qty}` : ""}.${term}`;
}

export function priceTable(deal: Deal): string {
  const { pricing } = deal;
  const t = bidTotals(pricing);
  const per = pricing.periodLabel === "year" ? "per year" : "per contract";
  const rows = pricing.lines.map(
    (l) => `| ${l.description} | ${l.unit} | ${l.quantity.toLocaleString()} | ${money(l.price, { cents: true })} | ${money(l.quantity * l.price, { cents: true })} |`,
  );
  const lines = [
    `| Item | Unit | Qty ${per} | Unit price | Extended |`,
    "|---|---|---:|---:|---:|",
    ...rows,
    `| **Total ${per}** | | | | **${money(t.pricePerPeriod, { cents: true })}** |`,
  ];
  if (pricing.periods > 1) {
    lines.push(`| **Total, ${pricing.periods} years** | | | | **${money(t.priceTotal, { cents: true })}** |`);
  }
  return lines.join("\n");
}

/**
 * The parts of the notice a sub needs: what, where, when. Contracting boilerplate
 * (FAR citations, set-asides, how to submit an offer) is dropped.
 */
export function customerDetails(description: string | undefined, max = 1800): string {
  if (!description) return "";
  const sentences = description.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  const boiler = /\bFAR\b|federal acquisition|DFARS|VAAR|\bclause|provision|set-aside|set aside|\bNAICS\b|size standard|\bSAM\b|SAM\.gov|solicitation (?:number|is issued)|request for (?:quote|quotation|proposal)|\bRFQ\b|\bRFP\b|combined synopsis|offeror|quotes? (?:are|shall|must|will) be|submit|e-?mail|point of contact|contracting (?:officer|specialist|office)|wage determination|in accordance with|incorporated|hereby|this announcement|this notice|simplified (?:procedures|acquisition)|\bFSC\b|\bPSC\b|product service code|classification code/i;
  let out = "";
  for (const s of sentences) {
    // Sentences with the government's email or phone are about contacting them, not the work.
    if (boiler.test(s) || s.length < 25 || /@|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/.test(s)) continue;
    if (out.length + s.length > max) break;
    out += (out ? " " : "") + s.trim();
  }
  return scrub(out);
}

function scrub(s: string): string {
  return s.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[contact removed]").replace(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "[contact removed]");
}

function docDetails(deal: Deal) {
  return deal.details?.noticeId === deal.opportunity.id ? deal.details : undefined;
}

function docRequirements(deal: Deal): string[] {
  const d = docDetails(deal);
  if (!d) return [];
  return [
    ...d.requirements.map((r) => r.value),
    ...(d.wageDeterminations.length ? [`Prevailing wages apply (wage determination ${d.wageDeterminations.join(", ")})`] : []),
  ];
}

/** Sizes and scope items from the attachments. Never the budget: this goes to subs. */
function docsSection(deal: Deal): string {
  const d = docDetails(deal);
  if (!d) return "";
  const items = d.reading?.scope.map((s) => `- ${s.description}${s.quantity != null ? `: ${s.quantity.toLocaleString()} ${s.unit ?? ""}`.trimEnd() : ""}`) ?? [];
  const sizes = d.sizes.slice(0, 3).map((s) => `- Size: ${s.value}`);
  const visit = d.siteVisit?.value.date ? [`- Site visit: ${formatDate(`${d.siteVisit.value.date}T12:00:00`)}${d.siteVisit.value.mandatory ? " (required)" : ""}`] : [];
  const period = d.period ? [`- Time to complete: ${d.period.value}`] : [];
  const all = [...items, ...sizes, ...period, ...visit];
  return all.length ? `### From the bid documents\n${all.join("\n")}\n\n` : "";
}

export function sowTemplate(deal: Deal, profile: CompanyProfile, now: Date = new Date()): string {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const lines = deal.pricing.lines
    .map((l) =>
      l.quantity === 1 && /^(job|lump sum|ls|each)$/i.test(l.unit)
        ? `- ${l.description}`
        : `- ${l.description}: about ${l.quantity.toLocaleString()} ${l.unit}${l.quantity === 1 ? "" : "s"} ${deal.pricing.periodLabel === "year" ? "per year" : "total"}`,
    )
    .join("\n");
  return `# Scope of Work: ${o.title}

**Request for quote${profile.companyName?.trim() ? ` from ${profile.companyName.trim()}` : ""}**
**Quotes due:** ${quoteDueDate(o.responseDeadline, now)}

## Summary
${workSummary(deal, now)}

## Location
${placeLabel(o.placeOfPerformance)}${o.placeOfPerformance.zip ? ` ${o.placeOfPerformance.zip}` : ""}

${/^check the notice/i.test(b.contractLength) ? "" : `## Term\n${b.contractLength}\n\n`}## Work to be performed
${lines || "- [Describe each task]"}

${docsSection(deal)}${customerDetails(o.description) ? `### Details from the customer\n${customerDetails(o.description)}\n` : ""}
## Requirements
${[...new Set([...(b.keyRequirements.length ? b.keyRequirements : ["Licenses and insurance required for this work"]), ...docRequirements(deal)])].map((r) => `- ${r}`).join("\n")}

## What to include in your quote
- Price per ${deal.pricing.lines[0]?.unit ?? "unit"}, all-in (labor, travel, materials, disposal and fees)
- Earliest start date and your availability for the schedule above
- 2–3 similar jobs you've done, with a contact for each
- Certificate of insurance and a W-9

## Payment terms
Net 30 after each job is completed and invoiced.

## Contact
${filled(profile.contactName, profile.companyName).join(", ") || "[your name]"}
${filled(profile.email, profile.phone).join(" · ") || "[email or phone]"}
`;
}

export function outreachTemplate(deal: Deal, profile: CompanyProfile, sub?: Subcontractor, now: Date = new Date()): string {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const place = placeLabel(o.placeOfPerformance);
  const hi = sub?.name ? `Hi ${sub.name} team,` : "Hi there,";
  return `## Email

**Subject:** Quote request: ${o.title} (${place})

${hi}

I'm ${or(profile.contactName, "your name")} with ${or(profile.companyName, "your company")}. We're bidding on a government contract in ${place}, and we're looking for a local partner to do the work.

- **What:** ${workSummary(deal, now)}${/^check the notice/i.test(b.contractLength) ? "" : `\n- **Term:** ${b.contractLength}`}
- **Pricing:** ${b.pricingStructure}

It's steady work with a government customer. Payment is net 30 after each job. I've attached the scope of work. Could you send a quote by **${quoteDueDate(o.responseDeadline, now)}**?

Thanks,
${or(profile.contactName, "your name")}
${or(profile.phone, "phone")}

## Call script

1. "Hi, this is ${or(profile.contactName, "your name")} with ${or(profile.companyName, "your company")}. Do you take on ${tradeOf(b.subcontractorSearchTerms[0]) || "this kind of"} work in ${place}?"
2. "We're bidding on a government job there and need a local partner.${lengthSentence(b.contractLength) ? ` ${lengthSentence(b.contractLength)}` : ""} Can I email you the scope of work?"
${b.questionsForSubs.map((q, i) => `${i + 3}. "${q}"`).join("\n")}
${b.questionsForSubs.length + 3}. "What's the best email for the scope, and can you get me a number by ${quoteDueDate(o.responseDeadline, now)}?"
`;
}

export function proposalTemplate(deal: Deal, profile: CompanyProfile, now: Date = new Date()): string {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const selected = deal.subs.find((s) => s.status === "selected");
  const poc = o.contacts[0];
  return `# ${o.title}

**Solicitation:** ${o.solicitationNumber || "[solicitation number]"}
**Submitted to:** ${o.office || o.agency}${poc ? `, Attn: ${poc.name}` : ""}
**Submitted by:** ${or(profile.companyName, "company name")}
**Date:** ${formatDate(now.toISOString())}

## Company information
| Company | ${or(profile.companyName, "company name")} |
|---|---|
| UEI | ${or(profile.uei, "UEI from SAM.gov")} |
| CAGE code | ${or(profile.cage, "CAGE code")} |
| Address | ${or(profile.address, "address")} |
| Point of contact | ${or(profile.contactName, "name")}, ${or(profile.contactTitle, "title")} |
| Email / phone | ${or(profile.email, "email")} / ${or(profile.phone, "phone")} |
| Small business status | [e.g. Small business, WOSB, SDVOSB] |

## Cover letter
${poc ? `Dear ${poc.name},` : "Dear Contracting Officer,"}

${or(profile.companyName, "Our company")} is pleased to submit this quote in response to ${o.solicitationNumber ? `solicitation ${o.solicitationNumber}, ` : ""}“${o.title},” for work in ${placeLabel(o.placeOfPerformance)}. We have read the requirement in full and will provide all labor, equipment and supervision needed to complete it on schedule and in compliance with the solicitation.

## Understanding of the requirement
${o.office || o.agency} is seeking the following: ${workSummary(deal, now)}${b.keyRequirements.length ? ` The contractor must meet the requirements below, including ${lowerFirst(b.keyRequirements[0]!)}.` : ""}

## Technical approach
${selected ? `We will perform this work with our local service partner, ${selected.name}, who will provide the crew and equipment on site.` : "We will perform this work with a qualified local service partner who will provide the crew and equipment on site."} ${or(profile.companyName, "Our company")} remains the single point of contact for scheduling, quality and invoicing.

${deal.pricing.lines.map((l, i) => `${i + 1}. **${l.description}.** [How and when this will be done.]`).join("\n")}

## Quality control
- A point of contact is available by phone and email during the period of performance.
- Each service is confirmed in writing with the government representative, with documentation (e.g. ${/waste/i.test(o.title) ? "signed manifests and certificates of disposal" : "service logs and photos"}).
- Problems are reported within one business day with a corrective plan.

## Past performance
[List 1–3 similar jobs: customer, dates, value, scope, and a reference contact.]

## Price
${priceTable(deal)}

## Requirements and certifications
${(b.keyRequirements.length ? b.keyRequirements : ["[Licenses, insurance and any certifications the solicitation asks for]"]).map((r) => `- ${r}`).join("\n")}
- Active SAM.gov registration (UEI ${or(profile.uei, "UEI")})
${(o.versions ?? 1) > 1 ? `- Acknowledges all ${(o.versions ?? 1) - 1} amendment(s): [list each number and date]` : "- [Acknowledge any amendments by number and date]"}

Sincerely,
${or(profile.contactName, "name")}
${or(profile.contactTitle, "title")}, ${or(profile.companyName, "company")}
`;
}

import { bidTotals } from "./bid-math.ts";
import { addDays, daysUntil, formatDate, money, placeLabel } from "./format.ts";
import { cleanTitle, rulesBreakdown } from "./rules.ts";
import type { CompanyProfile, Deal, Subcontractor } from "./types.ts";

// Fill-in-the-blank drafts used when Claude isn't configured. Anything in
// [brackets] needs the user's input.

const or = (v: string | undefined, placeholder: string) => (v && v.trim() ? v.trim() : `[${placeholder}]`);

/** Ask subs for quotes a few days before the government's deadline. */
export function quoteDueDate(deadline: string | null, now: Date = new Date()): string {
  const days = daysUntil(deadline, now);
  if (days == null) return "[quote due date]";
  const lead = days > 10 ? 4 : days > 5 ? 2 : 1;
  return formatDate(addDays(new Date(deadline!), -lead).toISOString(), { weekday: "long" });
}

const plural = (n: number, unit: string) => (n === 1 || /s$/.test(unit) ? unit : `${unit}s`);

/** Neutral description of the work, safe to send to subs or the government. */
export function workSummary(deal: Deal, now: Date = new Date()): string {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const what = cleanTitle(o.title).toLowerCase() || "the work described";
  const per = deal.pricing.periodLabel === "year" ? " per year" : "";
  const qty = deal.pricing.lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.quantity.toLocaleString()} ${plural(l.quantity, l.unit)}${per}`)
    .join(", ");
  const term = /^check the notice/i.test(b.contractLength) ? "" : ` Term: ${b.contractLength.charAt(0).toLowerCase()}${b.contractLength.slice(1)}.`;
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} in ${placeLabel(o.placeOfPerformance)}${qty ? `, estimated at ${qty}` : ""}.${term}`;
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

export function sowTemplate(deal: Deal, profile: CompanyProfile, now: Date = new Date()): string {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const lines = deal.pricing.lines
    .map((l) => `- ${l.description}: about ${l.quantity.toLocaleString()} ${l.unit}${l.quantity === 1 ? "" : "s"} ${deal.pricing.periodLabel === "year" ? "per year" : "total"}`)
    .join("\n");
  return `# Scope of Work: ${o.title}

**Request for quote from ${or(profile.companyName, "your company name")}**
**Quotes due:** ${quoteDueDate(o.responseDeadline, now)}

## Summary
${workSummary(deal, now)}

## Location
${placeLabel(o.placeOfPerformance)}${o.placeOfPerformance.zip ? ` ${o.placeOfPerformance.zip}` : ""}

## Term
${b.contractLength}

## Work to be performed
${lines || "- [Describe each task]"}

${o.description ? `### Details from the customer\n${o.description.slice(0, 2500)}\n` : ""}
## Requirements
${(b.keyRequirements.length ? b.keyRequirements : ["Licenses and insurance required for this work"]).map((r) => `- ${r}`).join("\n")}

## What to include in your quote
- Price per ${deal.pricing.lines[0]?.unit ?? "unit"}, all-in (labor, travel, materials, disposal and fees)
- Earliest start date and your availability for the schedule above
- 2–3 similar jobs you've done, with a contact for each
- Certificate of insurance and a W-9

## Payment terms
Net 30 after each job is completed and invoiced.

## Contact
${or(profile.contactName, "your name")}, ${or(profile.companyName, "company")}
${or(profile.email, "email")} · ${or(profile.phone, "phone")}
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

I'm ${or(profile.contactName, "your name")} with ${or(profile.companyName, "your company")}. We're bidding on a government contract for ${b.whoDoesTheWork.toLowerCase().replace(/^an? /, "")} work in ${place}, and we're looking for a local partner to do the work.

- **What:** ${workSummary(deal, now)}
- **Term:** ${b.contractLength}
- **Pricing:** ${b.pricingStructure}

It's steady work with a government customer. Payment is net 30 after each job. I've attached the scope of work. Could you send a quote by **${quoteDueDate(o.responseDeadline, now)}**?

Thanks,
${or(profile.contactName, "your name")}
${or(profile.phone, "phone")}

## Call script

1. "Hi, this is ${or(profile.contactName, "your name")} with ${or(profile.companyName, "your company")}. Do you do ${b.subcontractorSearchTerms[0] ?? "this kind of work"} in ${place}?"
2. "We're bidding on a ${b.contractLength.toLowerCase()} government job and need a local partner. Can I email you the scope of work?"
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
| | |
|---|---|
| Company | ${or(profile.companyName, "company name")} |
| UEI | ${or(profile.uei, "UEI from SAM.gov")} |
| CAGE code | ${or(profile.cage, "CAGE code")} |
| Address | ${or(profile.address, "address")} |
| Point of contact | ${or(profile.contactName, "name")}, ${or(profile.contactTitle, "title")} |
| Email / phone | ${or(profile.email, "email")} / ${or(profile.phone, "phone")} |
| Small business status | [e.g. Small business, WOSB, SDVOSB] |

## Cover letter
${poc ? `Dear ${poc.name},` : "Dear Contracting Officer,"}

${or(profile.companyName, "Our company")} is pleased to submit this quote for ${o.title.toLowerCase()} at ${placeLabel(o.placeOfPerformance)}. We have read the requirement in full and will provide all labor, equipment and supervision needed to complete it on schedule and in compliance with the ${o.type ? o.type.toLowerCase() : "solicitation"}.

## Understanding of the requirement
${o.office || o.agency} requires ${workSummary(deal, now).charAt(0).toLowerCase()}${workSummary(deal, now).slice(1)}${b.keyRequirements.length ? ` The contractor must meet the requirements below, including ${b.keyRequirements[0]!.charAt(0).toLowerCase()}${b.keyRequirements[0]!.slice(1)}.` : ""}

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
- [Acknowledge any amendments by number and date]

Sincerely,
${or(profile.contactName, "name")}
${or(profile.contactTitle, "title")}, ${or(profile.companyName, "company")}
`;
}

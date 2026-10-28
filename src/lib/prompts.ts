import { daysUntil, formatDate, placeLabel } from "./format.ts";
import { priceTable, quoteDueDate } from "./templates.ts";
import type { CompanyProfile, Deal, Opportunity, Subcontractor } from "./types.ts";

export const SYSTEM = `You are the back-office assistant for a small business that wins U.S. government service contracts as the prime contractor and hires local companies (subcontractors) to do the work, adding a margin on top. The owner is often new to government contracting.

Write in plain, direct English. Only state facts that appear in the material you're given; never invent licenses, past contracts, prices, dates, names or certifications. Where something is missing, leave a [bracketed placeholder] for the owner to fill in.`;

function opportunityBlock(o: Opportunity, now: Date): string {
  const days = daysUntil(o.responseDeadline, now);
  const meta = {
    title: o.title,
    solicitationNumber: o.solicitationNumber,
    agency: o.agency,
    office: o.office,
    noticeType: o.type,
    setAside: o.setAside,
    naics: o.naicsCode,
    productServiceCode: o.pscCode,
    placeOfPerformance: placeLabel(o.placeOfPerformance),
    responseDeadline: o.responseDeadline ? `${formatDate(o.responseDeadline)}${days != null ? ` (${days} days from today)` : ""}` : null,
    attachments: o.attachments ? o.attachments.length : "not listed",
    amendments: o.versions && o.versions > 1 ? o.versions - 1 : 0,
  };
  const description = o.description?.trim()
    ? o.description.trim()
    : "(Full description not available. Work from the title and details above.)";
  return `<opportunity>\n${JSON.stringify(meta, null, 2)}\n</opportunity>\n\n<description>\n${description}\n</description>`;
}

function profileBlock(p: CompanyProfile): string {
  const fields = {
    companyName: p.companyName,
    uei: p.uei,
    cage: p.cage,
    address: p.address,
    contact: [p.contactName, p.contactTitle].filter(Boolean).join(", "),
    email: p.email,
    phone: p.phone,
    website: p.website,
    capabilities: p.capabilities,
  };
  const filled = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && String(v).trim()));
  return `<my_company>\n${Object.keys(filled).length ? JSON.stringify(filled, null, 2) : "(Not filled in yet. Use placeholders.)"}\n</my_company>`;
}

function linesBlock(deal: Deal): string {
  const per = deal.pricing.periodLabel === "year" ? "per year" : "for the whole job";
  const lines = deal.pricing.lines.map((l) => `- ${l.description}: ${l.quantity} ${l.unit}(s) ${per}`).join("\n");
  return `<line_items periods="${deal.pricing.periods}">\n${lines || "(none yet)"}\n</line_items>`;
}

export function breakdownPrompt(o: Opportunity, now: Date = new Date()): string {
  return `Read this contract opportunity and fill in the breakdown.

${opportunityBlock(o, now)}

- plainEnglish: 2–3 sentences a person with no contracting background understands: who is buying, what they need done, where, and how often.
- whoDoesTheWork: the kind of local company that would do the hands-on work.
- subcontractorSearchTerms: 2–4 phrases to type into Google Maps to find that kind of company. No location.
- pricingStructure: how the price is likely structured (per pickup, per person per meal, monthly, lump sum…), with quantities if given.
- suggestedLines: the price-schedule lines, with quantityPerPeriod per year (or for the whole job if it's one-time).
- contractLength and periods: total years including option years (1 for a one-time job), or null if not stated.
- keyRequirements, questionsForSubs, redFlags: specific to this notice; an empty list is fine.
- difficulty: how hard this is for a first-time bidder to win using a subcontractor.`;
}

export function sowPrompt(deal: Deal, profile: CompanyProfile, now: Date = new Date()): string {
  return `Write a scope of work I can email to local companies to get a quote for this job. It goes to subcontractors, not the government: leave out the government contact's details and anything about my pricing or margin.

${opportunityBlock(deal.opportunity, now)}

${linesBlock(deal)}

${profileBlock(profile)}

Use these sections: Summary, Location, Term, Schedule and frequency, Work to be performed, Requirements, What to include in your quote (a price per unit that matches the line items, availability, 2–3 similar jobs with references, certificate of insurance, W-9), Quotes due (${quoteDueDate(deal.opportunity.responseDeadline, now)}), Payment terms (net 30 after each job is completed and invoiced), Contact. Markdown, under 600 words.`;
}

export function outreachPrompt(deal: Deal, profile: CompanyProfile, sub: Subcontractor | undefined, now: Date = new Date()): string {
  const who = sub ? `<subcontractor>\n${JSON.stringify({ name: sub.name, category: sub.category, address: sub.address, rating: sub.rating, reviews: sub.reviewCount }, null, 2)}\n</subcontractor>` : "(No specific company yet. Write it so it works for any local provider.)";
  return `Write a short email and a phone call script asking a local company for a quote on this job.

${opportunityBlock(deal.opportunity, now)}

${who}

${profileBlock(profile)}

Friendly and peer-to-peer. The email is under 150 words and mentions: it's steady government work, the term, net-30 payment after each job, the attached scope of work, and quotes due ${quoteDueDate(deal.opportunity.responseDeadline, now)}. The call script is 5–7 numbered lines and covers price per unit, availability, net-30 terms, licenses/insurance, and 2–3 similar past jobs. Use the headings "## Email" (starting with a **Subject:** line) and "## Call script".`;
}

export function proposalPrompt(deal: Deal, profile: CompanyProfile, now: Date = new Date()): string {
  const selected = deal.subs.filter((s) => s.status === "selected" || s.status === "quoted");
  const partners = selected.length
    ? `<subcontractors>\n${JSON.stringify(selected.map((s) => ({ name: s.name, status: s.status, notes: s.notes, address: s.address })), null, 2)}\n</subcontractors>`
    : "(No subcontractor selected yet. Refer to \"our local service partner\".)";
  return `Write the quote/proposal I'll submit to the government for this solicitation.

${opportunityBlock(deal.opportunity, now)}

${profileBlock(profile)}

${partners}

<price_table>
${priceTable(deal)}
</price_table>

If the description gives submission instructions (required sections, page limits, forms), follow them. Otherwise use: Company information (a table with company, UEI, CAGE, address, point of contact, small-business status), Cover letter, Understanding of the requirement, Technical approach (how the work gets done: by us, with our local partner doing the on-site work), Management and quality control, Past performance, Price, Requirements and certifications, Signature. Reproduce the price table exactly as given. Keep it concise and specific to this requirement. Markdown.`;
}

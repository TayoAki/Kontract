import { bidTotals } from "./bid-math.ts";
import { budgetLabel } from "./bid-details.ts";
import { followUpStatus } from "./crm.ts";
import { OPEN_STAGES, stageLabel } from "./deal.ts";
import { fitScore } from "./fit-score.ts";
import { daysUntil, placeLabel } from "./format.ts";
import type { RecipientSummary } from "./pricing-stats.ts";
import type { QuoteRequest } from "./quote.ts";
import { rulesBreakdown } from "./rules.ts";
import type { BidDetails, Cited, CrmContact, Deal, Opportunity, PastAward, Permit, PermitContractor, PricingResults } from "./types.ts";

// What the MCP tools hand back to an AI assistant: compact, plain JSON with
// the fields a model needs to answer and act, and long text clipped so one
// call can't flood its context. Everything here is the signed-in prime's own
// data or public records.

/** Cut text to `max` characters on a word boundary, marking the cut. */
export function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}… [${t.length - max} more characters]`;
}

const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export function opportunityRow(o: Opportunity, now: Date = new Date()) {
  const fit = fitScore(o, now);
  return {
    id: o.id,
    title: o.title,
    agency: o.agency,
    place: placeLabel(o.placeOfPerformance) || null,
    level: o.source === "sled" ? "state/local" : "federal",
    type: o.type,
    setAside: o.setAside,
    naics: o.naicsCode,
    postedDate: ymd(o.postedDate),
    dueDate: ymd(o.responseDeadline),
    daysLeft: daysUntil(o.responseDeadline, now),
    fit: { score: fit.score, verdict: fit.verdict },
    url: o.portal ?? o.samUrl,
    ...(o.isSample ? { sample: true } : {}),
  };
}

/** A notice in full: what it is, the fit score's reasons, and a rules-based read of the work. */
export function opportunityDetail(o: Opportunity, now: Date = new Date(), deal?: Deal) {
  const fit = fitScore(o, now, deal?.details);
  const b = deal?.breakdown ?? rulesBreakdown(o, now);
  return {
    ...opportunityRow(o, now),
    solicitationNumber: o.solicitationNumber || null,
    office: o.office || null,
    psc: o.pscCode,
    amendments: Math.max(0, (o.versions ?? 1) - 1),
    contractingOfficers: o.contacts.map((c) => ({ name: c.name, email: c.email ?? null, phone: c.phone ?? null })),
    fit: { score: fit.score, verdict: fit.verdict, reasons: fit.criteria.map((c) => ({ label: c.label, level: c.level, detail: c.detail })) },
    read: {
      plainEnglish: b.plainEnglish,
      whoDoesTheWork: b.whoDoesTheWork,
      contractLength: b.contractLength,
      pricingStructure: b.pricingStructure,
      keyRequirements: b.keyRequirements,
      redFlags: b.redFlags,
      questionsForSubs: b.questionsForSubs,
      subSearchTerms: b.subcontractorSearchTerms,
      source: b.source,
    },
    description: clip(o.description, 4000),
  };
}

function quoteCounts(deal: Deal, requests: QuoteRequest[]) {
  const mine = requests.filter((r) => r.dealId === deal.id);
  return { linksMade: mine.length, opened: mine.filter((r) => r.viewedAt).length, received: deal.subs.filter((s) => s.quoteTotal != null || s.quote != null).length };
}

/** One tracked bid: stage, deadline, money and progress. */
export function dealSummary(deal: Deal, requests: QuoteRequest[], now: Date = new Date()) {
  const t = bidTotals(deal.pricing);
  const per = deal.pricing.periodLabel === "year" ? "year" : "contract";
  return {
    id: deal.id,
    title: deal.opportunity.title,
    stage: stageLabel(deal.stage),
    dueDate: ymd(deal.opportunity.responseDeadline),
    daysLeft: daysUntil(deal.opportunity.responseDeadline, now),
    price: t.pricePerPeriod ? { per, subCost: round(t.subPerPeriod), yourPrice: round(t.pricePerPeriod), profit: round(t.profitPerPeriod), margin: t.margin == null ? null : round(t.margin * 100, 1), periods: deal.pricing.periods, contractTotal: round(t.priceTotal) } : null,
    subs: deal.subs.length,
    quotes: quoteCounts(deal, requests),
    hasScope: Boolean(deal.sow?.trim()),
    hasProposal: Boolean(deal.proposal?.trim()),
    submittedAt: ymd(deal.submittedAt),
  };
}

/** A tracked bid with its price lines and shortlist, for working on it. */
export function dealDetail(deal: Deal, requests: QuoteRequest[], now: Date = new Date()) {
  const mine = requests.filter((r) => r.dealId === deal.id);
  return {
    ...dealSummary(deal, requests, now),
    notes: clip(deal.notes, 1500) || null,
    priceLines: deal.pricing.lines.map((l) => ({ description: l.description, unit: l.unit, quantityPerPeriod: l.quantity, subCostPerUnit: l.subCost, yourPricePerUnit: l.price })),
    shortlist: deal.subs.map((s) => {
      const link = mine.find((r) => r.subId === s.id);
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        phone: s.phone ?? null,
        email: s.email ?? null,
        website: s.website ?? null,
        quoteTotal: s.quoteTotal ?? s.quote ?? null,
        quoteLink: link ? { status: link.status, opened: Boolean(link.viewedAt) } : null,
        benchId: s.crmId ?? null,
      };
    }),
  };
}

const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;
const money = (n: number | null) => (n == null ? null : round(n));

function cited<T>(c: Cited<T> | null, show: (v: T) => unknown = (v) => v) {
  return c ? { value: show(c.value), source: { document: c.doc, says: clip(c.quote, 300) } } : null;
}

/** What the bid's documents say, each fact with the sentence it came from. */
export function bidDetailsOut(d: BidDetails) {
  return {
    documents: d.documents.map((x) => ({ name: x.name, read: x.read, pages: x.pages ?? null, url: x.url })),
    budget: cited(d.budget, budgetLabel),
    bonds: cited(d.bonds),
    siteVisit: cited(d.siteVisit, (v) => ({ date: v.date, mandatory: v.mandatory })),
    questionsDue: cited(d.questionsDue),
    periodOfPerformance: cited(d.period),
    howTheyPick: cited(d.evaluation),
    wageDeterminations: d.wageDeterminations,
    sizes: d.sizes.map((s) => cited(s)),
    requirements: d.requirements.map((r) => cited(r)),
    formsToReturn: d.forms,
    priceForm: d.priceForm,
  };
}

/** Past awards: the typical price, the most relevant awards, and who won them. */
export function pricingOut(r: PricingResults, recipients: RecipientSummary[]) {
  const s = r.stats;
  const award = (a: PastAward) => ({
    recipient: a.recipient,
    amount: round(a.amount),
    perYear: a.annualAmount == null ? null : round(a.annualAmount),
    years: a.years == null ? null : round(a.years, 1),
    agency: a.subAgency || a.agency,
    state: a.state,
    start: a.startDate,
    end: a.endDate,
    description: clip(a.description, 200),
    likelyRelated: a.likelyRelated,
    url: a.url,
  });
  const awards = [...r.awards].sort((a, b) => Number(b.likelyRelated) - Number(a.likelyRelated)).slice(0, 12);
  return {
    query: r.query,
    found: s.count,
    typical: {
      perYear: money(s.medianAnnual),
      perYearRange: s.lowAnnual == null ? null : [money(s.lowAnnual), money(s.highAnnual)],
      wholeAward: money(s.medianTotal),
      wholeAwardRange: s.lowTotal == null ? null : [money(s.lowTotal), money(s.highTotal)],
    },
    awards: awards.map(award),
    pastWinners: recipients.slice(0, 10).map((x) => ({ name: x.name, awards: x.awards, total: round(x.total), states: x.states, latest: x.latest })),
  };
}

export function contactRow(c: CrmContact, now: Date = new Date()) {
  const last = c.activities[0]; // newest first
  return {
    id: c.id,
    company: c.company,
    stage: c.stage,
    trade: c.trade ?? null,
    place: placeLabel({ city: c.city, state: c.state }) || null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    website: c.website ?? null,
    license: c.license ?? null,
    followUp: c.nextFollowUp ? { date: c.nextFollowUp, status: followUpStatus(c, now) } : null,
    lastActivity: last ? { at: ymd(last.at), kind: last.kind, text: clip(last.text, 160) } : null,
  };
}

export function permitRow(p: Permit) {
  return {
    id: p.id,
    issued: p.issuedDate,
    type: p.type,
    description: clip(p.description, 240),
    address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", "),
    value: p.value ?? null,
    contractor: p.contractor ? { name: p.contractor, phone: p.contractorPhone ?? null, license: p.contractorLicense ?? null } : null,
    owner: p.owner ?? null,
    residential: p.residential,
    leadFor: p.trades.map((t) => ({ trade: t.trade, strength: t.strength })),
    record: p.url,
  };
}

export function contractorRow(c: PermitContractor) {
  return { name: c.name, phone: c.phone ?? null, license: c.license ?? null, insuredUntil: c.insuredUntil ?? null, permits: c.permits, jobs: c.jobs, latest: c.latest, permitTypes: c.types.slice(0, 4), market: c.market ?? null };
}

/** What needs doing soon: bids due in the next two weeks and subs to follow up with. */
export function dueSoon(deals: Deal[], contacts: CrmContact[], requests: QuoteRequest[], now: Date = new Date()) {
  const bids = deals
    .filter((d) => OPEN_STAGES.includes(d.stage))
    .map((d) => dealSummary(d, requests, now))
    .filter((d) => d.daysLeft != null && d.daysLeft >= 0 && d.daysLeft <= 14)
    .sort((a, b) => a.daysLeft! - b.daysLeft!);
  const followUps = contacts
    .filter((c) => {
      const s = followUpStatus(c, now);
      return s === "overdue" || s === "today";
    })
    .map((c) => contactRow(c, now));
  const quotesToReview = requests.filter((r) => r.submittedAt && !r.importedAt).map((r) => ({ bidId: r.dealId, sub: r.subName, submittedAt: ymd(r.submittedAt), total: r.response?.total ?? null }));
  return { bidsDueIn14Days: bids, followUpsDue: followUps, quotesNotYetInABid: quotesToReview };
}

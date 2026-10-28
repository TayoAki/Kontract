import { placeLabel } from "./format.ts";
import { rulesBreakdown } from "./rules.ts";
import { quoteDueDate, sowTemplate, workSummary } from "./templates.ts";
import type { CompanyProfile, Deal, PriceLine, Subcontractor } from "./types.ts";

// The online quote: what a subcontractor sees when they open the link (the
// scope and the line items, never your price, markup or margin), what they
// send back, and how it lands in the bid's pricing.

export interface QuoteLine {
  id: string;
  description: string;
  unit: string;
  quantity: number;
}

export interface QuoteSnapshot {
  jobTitle: string;
  summary: string;
  location: string;
  term: string;
  /** e.g. "Monday, Nov 9, 2026". */
  dueBy: string;
  /** The scope of work, with contact details from the notice removed. */
  scope: string;
  lines: QuoteLine[];
  periods: number;
  periodLabel: "year" | "contract";
  requirements: string[];
  prime: { company: string; contactName: string; email: string; phone: string };
  subName: string;
  createdAt: string;
}

export interface QuoteResponse {
  /** Their price per unit for each line. */
  lines: { id: string; unitPrice: number }[];
  /** Per period (per year, or for the whole job). */
  total: number;
  startDate?: string;
  notes?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  /** They confirm they carry insurance and can send a certificate. */
  insured: boolean;
  submittedAt: string;
}

export type QuoteStatus = "sent" | "viewed" | "submitted";

/** A quote link as the prime sees it. */
export interface QuoteRequest {
  token: string;
  dealId: string;
  subId: string;
  subName: string;
  subEmail: string | null;
  status: QuoteStatus;
  createdAt: string;
  viewedAt: string | null;
  submittedAt: string | null;
  importedAt: string | null;
  response: QuoteResponse | null;
}

/** Submitted and not yet put into the bid (or revised since). */
export const needsImport = (r: QuoteRequest) => Boolean(r.response && r.submittedAt && (!r.importedAt || r.submittedAt > r.importedAt));

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/** Notices often carry the contracting officer's details; subs deal with you, not the customer. */
export const scrubContacts = (s: string) => s.replace(EMAIL, "[contact removed]").replace(PHONE, "[contact removed]");

/** Lines a sub can price: description, unit and quantity only. */
const toQuoteLine = (l: PriceLine): QuoteLine => ({ id: l.id, description: l.description, unit: l.unit, quantity: l.quantity });

export function quoteSnapshot(deal: Deal, sub: Pick<Subcontractor, "name">, profile: CompanyProfile, now: Date = new Date()): QuoteSnapshot {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o, now);
  const scope = deal.sow?.trim() || sowTemplate(deal, profile, now);
  return {
    jobTitle: o.title,
    summary: workSummary(deal, now),
    location: `${placeLabel(o.placeOfPerformance)}${o.placeOfPerformance.zip ? ` ${o.placeOfPerformance.zip}` : ""}`,
    term: b.contractLength,
    dueBy: quoteDueDate(o.responseDeadline, now),
    scope: scrubContacts(scope),
    lines: deal.pricing.lines.map(toQuoteLine),
    periods: deal.pricing.periods,
    periodLabel: deal.pricing.periodLabel,
    requirements: b.keyRequirements.length ? b.keyRequirements : ["Licenses and insurance required for this work"],
    prime: { company: profile.companyName, contactName: profile.contactName, email: profile.email, phone: profile.phone },
    subName: sub.name,
    createdAt: now.toISOString(),
  };
}

export function quoteTotal(snapshot: Pick<QuoteSnapshot, "lines">, prices: { id: string; unitPrice: number }[]): number {
  const by = new Map(prices.map((p) => [p.id, p.unitPrice]));
  return Math.round(snapshot.lines.reduce((t, l) => t + (by.get(l.id) ?? 0) * l.quantity, 0) * 100) / 100;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Check what the sub sent against the snapshot; prices must be numbers ≥ 0 and at least one above 0. */
export function validateQuote(snapshot: QuoteSnapshot, body: unknown, now: Date = new Date()): { ok: true; response: QuoteResponse } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send your prices." };
  const b = body as Record<string, unknown>;
  const raw = Array.isArray(b.lines) ? (b.lines as { id?: unknown; unitPrice?: unknown }[]) : [];
  const lines: { id: string; unitPrice: number }[] = [];
  for (const l of snapshot.lines) {
    const hit = raw.find((r) => r && r.id === l.id);
    const n = typeof hit?.unitPrice === "number" ? hit.unitPrice : Number.parseFloat(String(hit?.unitPrice ?? ""));
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return { ok: false, error: `Enter a price for "${l.description}".` };
    lines.push({ id: l.id, unitPrice: Math.round(n * 100) / 100 });
  }
  if (snapshot.lines.length && !lines.some((l) => l.unitPrice > 0)) return { ok: false, error: "Enter at least one price." };
  const email = str(b.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
  return {
    ok: true,
    response: {
      lines,
      total: quoteTotal(snapshot, lines),
      startDate: str(b.startDate, 40),
      notes: str(b.notes, 4000),
      contactName: str(b.contactName, 120),
      email,
      phone: str(b.phone, 40),
      insured: b.insured === true,
      submittedAt: now.toISOString(),
    },
  };
}

/**
 * Put a submitted quote into the bid: the sub becomes "quoted" with their
 * per-line prices. If you haven't priced the bid yet, their prices become your
 * sub cost and your price is set with your markup.
 */
export function applyQuote(deal: Deal, subId: string, r: QuoteResponse, markupPct: number): Deal {
  const sub = deal.subs.find((s) => s.id === subId);
  if (!sub) return deal;
  const lineQuotes = Object.fromEntries(r.lines.map((l) => [l.id, l.unitPrice]));
  const first = deal.pricing.lines[0];
  const firstPrice = first ? lineQuotes[first.id] : undefined;
  const unpriced = deal.pricing.lines.every((l) => !l.subCost);
  const lines = unpriced
    ? deal.pricing.lines.map((l) => {
        const cost = lineQuotes[l.id];
        if (cost == null) return l;
        return { ...l, subCost: cost, price: l.price > 0 ? l.price : Math.round(cost * (1 + markupPct / 100) * 100) / 100 };
      })
    : deal.pricing.lines;
  const notes = [sub.notes, r.notes && `Quote notes: ${r.notes}`, r.startDate && `Can start: ${r.startDate}`].filter(Boolean).join("\n");
  return {
    ...deal,
    stage: unpriced && (deal.stage === "found" || deal.stage === "sourcing") ? "quoted" : deal.stage,
    pricing: { ...deal.pricing, lines },
    subs: deal.subs.map((s) =>
      s.id === subId
        ? {
            ...s,
            status: s.status === "selected" ? "selected" : "quoted",
            quote: firstPrice ?? s.quote,
            quoteBasis: first?.unit ?? s.quoteBasis,
            quoteTotal: r.total,
            lineQuotes,
            email: s.email ?? r.email,
            phone: s.phone ?? r.phone,
            notes: notes || undefined,
          }
        : s,
    ),
  };
}

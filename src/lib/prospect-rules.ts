import { uid } from "./format.ts";
import type { BusinessProfile, LeadPlan, Prospect, ProspectPerson, SignalKind } from "./types.ts";

// Pure rules around the AI customer finder: how often it may run, cleaning
// what the model returns (dedupe, drop anything without a source, drop emails
// that weren't on a page it read), and labeled sample output for demos.

export const SIGNAL_KINDS: { id: SignalKind; label: string }[] = [
  { id: "funding", label: "Recently raised" },
  { id: "hiring", label: "Hiring" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "community", label: "Community" },
  { id: "news", label: "In the news" },
];

/** "acme.com/about" → "https://acme.com/about"; null for anything that isn't a public web address. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(url.hostname)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const DAY = 86400000;

/** Runs cost real money: once a week on free, once a day on daily. Returns when the next run is allowed, or null if now. */
export function nextRunAllowed(plan: LeadPlan, lastRunAt: string | undefined, now: Date = new Date()): string | null {
  if (!lastRunAt) return null;
  const wait = plan === "daily" ? DAY : 7 * DAY;
  const next = Date.parse(lastRunAt) + wait;
  return next > now.getTime() ? new Date(next).toISOString() : null;
}

const key = (s: string) => s.toLowerCase().replace(/\b(inc|llc|corp|co|ltd|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isUrl = (s: string | undefined) => Boolean(s && /^https?:\/\/[^\s]+\.[^\s]+/.test(s));

export interface RawProspect {
  company: string;
  website?: string | null;
  kind: SignalKind;
  signal: string;
  signalUrl: string;
  signalDate?: string | null;
  whyFit: string;
  location?: string | null;
  fundingAmount?: string | null;
  fundingRound?: string | null;
  fundingDate?: string | null;
  hiring?: string[] | null;
  people?: { name: string; title?: string | null; linkedin?: string | null; email?: string | null }[] | null;
  outreachSubject: string;
  outreachBody: string;
}

/**
 * Keep prospects that have a company, a reason and a source URL; drop ones
 * already found before; keep an email only if it appears in the research the
 * model actually read (no guessed addresses).
 */
export function cleanProspects(raw: RawProspect[], research: string, existing: Pick<Prospect, "company">[], now: Date = new Date()): Prospect[] {
  const seen = new Set(existing.map((p) => key(p.company)));
  const haystack = research.toLowerCase();
  const out: Prospect[] = [];
  for (const r of raw) {
    const company = r.company?.trim();
    if (!company || !r.signal?.trim() || !r.whyFit?.trim() || !isUrl(r.signalUrl)) continue;
    const k = key(company);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const people: ProspectPerson[] = (r.people ?? [])
      .filter((p) => p.name?.trim())
      .slice(0, 3)
      .map((p) => ({
        name: p.name.trim(),
        title: p.title?.trim() || undefined,
        linkedin: p.linkedin && /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(p.linkedin) ? p.linkedin : undefined,
        email: p.email && EMAIL.test(p.email) && haystack.includes(p.email.toLowerCase()) ? p.email : undefined,
      }));
    const date = (v?: string | null) => (v && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : undefined);
    out.push({
      id: uid("pros"),
      company,
      website: isUrl(r.website ?? undefined) ? r.website! : undefined,
      kind: r.kind,
      signal: r.signal.trim(),
      signalUrl: r.signalUrl,
      signalDate: date(r.signalDate),
      whyFit: r.whyFit.trim(),
      location: r.location?.trim() || undefined,
      funding: r.kind === "funding" || r.fundingAmount ? { amount: r.fundingAmount || undefined, round: r.fundingRound || undefined, date: date(r.fundingDate) } : undefined,
      hiring: r.hiring?.filter(Boolean).slice(0, 5),
      people,
      outreach: { subject: r.outreachSubject.trim(), body: r.outreachBody.trim() },
      status: "new",
      foundAt: now.toISOString(),
    });
  }
  return out;
}

/** Labeled demo output, so the screen can be tried without a Claude key. */
export function sampleProspects(website: string, now: Date = new Date()): { profile: BusinessProfile; prospects: Prospect[] } {
  const host = new URL(website).hostname.replace(/^www\./, "");
  const profile: BusinessProfile = {
    summary: `Sample profile for ${host}. Add ANTHROPIC_API_KEY to read the real site.`,
    services: ["[service from your site]"],
    idealCustomers: ["Growing companies with an office or site in your area"],
    serviceArea: "[your area]",
    buyingSignals: ["Just raised money", "Hiring fast", "Opening a new office"],
  };
  const base = { status: "new" as const, foundAt: now.toISOString(), sample: true, people: [{ name: "Sample Founder", title: "CEO" }] };
  return {
    profile,
    prospects: [
      { ...base, id: uid("pros"), company: "Sample: Northwind Robotics", kind: "funding", signal: "Raised a $14M Series A", signalUrl: "https://example.com/sample-funding", whyFit: "New money and a new office usually means build-out and services.", location: "[city]", funding: { amount: "$14M", round: "Series A" }, outreach: { subject: "Congrats on the raise", body: "[Sample outreach. Add ANTHROPIC_API_KEY for real prospects.]" } },
      { ...base, id: uid("pros"), company: "Sample: Contoso Health", kind: "hiring", signal: "Hiring 12 roles at a new location", signalUrl: "https://example.com/sample-hiring", whyFit: "A new location needs vendors set up before opening.", location: "[city]", hiring: ["Office manager", "Facilities coordinator"], outreach: { subject: "Your new location", body: "[Sample outreach.]" } },
    ],
  };
}

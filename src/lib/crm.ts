import { uid } from "./format.ts";
import type { CrmActivity, CrmContact, CrmStage, Deal, SubStatus } from "./types.ts";

// Pure helpers for your subcontractor bench: stages, new contacts, logging
// touches, follow-ups, the jobs each sub has quoted or won, and a summary.

export const CRM_STAGES: { id: CrmStage; label: string; hint: string }[] = [
  { id: "found", label: "Found", hint: "Found them, haven't reached out" },
  { id: "contacted", label: "Contacted", hint: "Reached out, waiting to hear back" },
  { id: "quoted", label: "Quoted", hint: "Has sent you a quote" },
  { id: "active", label: "Active sub", hint: "Doing work with you" },
  { id: "not-a-fit", label: "Not a fit", hint: "Not interested, or not someone you'd hire" },
];

export const crmStageLabel = (s: CrmStage) => CRM_STAGES.find((x) => x.id === s)?.label ?? s;

export const ACTIVITY_KINDS: { id: CrmActivity["kind"]; label: string }[] = [
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "text", label: "Text" },
  { id: "meeting", label: "Meeting" },
  { id: "note", label: "Note" },
];

// Stages from when the CRM tracked lead-list subscribers.
const OLD_STAGES: Record<string, CrmStage> = { prospect: "found", trial: "quoted", paying: "active", lost: "not-a-fit" };

/** Bring a stored contact up to date (old stage names, missing fields). */
export function migrateContact(c: CrmContact): CrmContact {
  const stage = CRM_STAGES.some((s) => s.id === c.stage) ? c.stage : (OLD_STAGES[c.stage as string] ?? "found");
  return { ...c, stage, activities: Array.isArray(c.activities) ? c.activities : [] };
}

export const companyKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function newContact(fields: Partial<CrmContact> & { company: string }, now: Date = new Date()): CrmContact {
  const at = now.toISOString();
  return {
    source: "manual",
    stage: "found",
    activities: [],
    ...fields,
    company: fields.company.trim(),
    id: fields.id ?? uid("crm"),
    createdAt: at,
    updatedAt: at,
  };
}

/** The contact already on the bench for this company name, if any. */
export function findContact(contacts: CrmContact[], company: string): CrmContact | undefined {
  const key = companyKey(company);
  return key ? contacts.find((c) => companyKey(c.company) === key) : undefined;
}

/** Add a touch to the log, newest first. Reaching out moves a found sub to contacted. */
export function logActivity(c: CrmContact, kind: CrmActivity["kind"], text: string, now: Date = new Date()): CrmContact {
  const activity: CrmActivity = { id: uid("act"), at: now.toISOString(), kind, text: text.trim() };
  const stage = c.stage === "found" && kind !== "note" ? "contacted" : c.stage;
  return { ...c, stage, activities: [activity, ...c.activities] };
}

/** A sub sent a quote: move them forward (never backward) and log it. */
export function recordQuote(c: CrmContact, jobTitle: string, total: number | null, now: Date = new Date()): CrmContact {
  const stage: CrmStage = c.stage === "active" ? "active" : "quoted";
  const amount = total != null ? `$${Math.round(total).toLocaleString("en-US")}` : "a price";
  return { ...logActivity(c, "note", `Quoted ${amount} for "${jobTitle}"`, now), stage };
}

const isoDay = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export type FollowUp = "overdue" | "today" | "upcoming" | null;

export function followUpStatus(c: CrmContact, now: Date = new Date()): FollowUp {
  if (!c.nextFollowUp || c.stage === "not-a-fit") return null;
  const today = isoDay(now);
  if (c.nextFollowUp < today) return "overdue";
  if (c.nextFollowUp === today) return "today";
  return "upcoming";
}

/** A follow-up date `days` from now, as YYYY-MM-DD. */
export function followUpIn(days: number, now: Date = new Date()): string {
  return isoDay(new Date(now.getTime() + days * 86400000));
}

export type JobOutcome = "shortlisted" | "asked" | "quoted" | "selected" | "won" | "lost" | "declined";

export interface SubJob {
  dealId: string;
  title: string;
  agency: string;
  deadline: string | null;
  outcome: JobOutcome;
  /** Their quote per period, when they sent one. */
  quote?: number;
}

const OUTCOME: Record<SubStatus, JobOutcome> = { new: "shortlisted", contacted: "asked", quoted: "quoted", selected: "selected", declined: "declined" };

/** Every bid this sub is on, from your deals: what they quoted and whether you won with them. */
export function subJobs(c: CrmContact, deals: Deal[]): SubJob[] {
  const key = companyKey(c.company);
  const jobs: SubJob[] = [];
  for (const d of deals) {
    const sub = d.subs.find((s) => s.crmId === c.id || (key && companyKey(s.name) === key));
    if (!sub) continue;
    let outcome = OUTCOME[sub.status];
    if (sub.status === "selected" && d.stage === "won") outcome = "won";
    if (sub.status === "selected" && d.stage === "lost") outcome = "lost";
    jobs.push({ dealId: d.id, title: d.opportunity.title, agency: d.opportunity.agency, deadline: d.opportunity.responseDeadline, outcome, quote: sub.quoteTotal ?? sub.quote });
  }
  return jobs.sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? ""));
}

export interface BenchSummary {
  byStage: Record<CrmStage, number>;
  /** Subs per trade (contacts without one are "Other"). */
  byTrade: Record<string, number>;
  /** Follow-ups due today or overdue, oldest first. */
  due: CrmContact[];
  /** Share of subs you reached out to who sent a quote. */
  quoteRate: number | null;
}

export function benchSummary(contacts: CrmContact[], now: Date = new Date()): BenchSummary {
  const byStage: Record<CrmStage, number> = { found: 0, contacted: 0, quoted: 0, active: 0, "not-a-fit": 0 };
  const byTrade: Record<string, number> = {};
  for (const c of contacts) {
    byStage[c.stage] += 1;
    if (c.stage !== "not-a-fit") byTrade[c.trade || "Other"] = (byTrade[c.trade || "Other"] ?? 0) + 1;
  }
  const due = contacts
    .filter((c) => {
      const f = followUpStatus(c, now);
      return f === "overdue" || f === "today";
    })
    .sort((a, b) => (a.nextFollowUp ?? "").localeCompare(b.nextFollowUp ?? ""));
  const reached = byStage.contacted + byStage.quoted + byStage.active + byStage["not-a-fit"];
  return { byStage, byTrade, due, quoteRate: reached ? (byStage.quoted + byStage.active) / reached : null };
}

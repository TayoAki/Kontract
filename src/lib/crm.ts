import { uid } from "./format.ts";
import type { CrmActivity, CrmContact, CrmStage } from "./types.ts";

// Pure CRM helpers: stages, new contacts, logging touches, follow-ups and the
// pipeline summary.

export const CRM_STAGES: { id: CrmStage; label: string; hint: string }[] = [
  { id: "prospect", label: "Prospect", hint: "Haven't reached out yet" },
  { id: "contacted", label: "Contacted", hint: "Pitched, waiting to hear back" },
  { id: "trial", label: "Trial", hint: "Getting the free list" },
  { id: "paying", label: "Paying", hint: "Monthly client" },
  { id: "lost", label: "Lost", hint: "Said no or cancelled" },
];

export const crmStageLabel = (s: CrmStage) => CRM_STAGES.find((x) => x.id === s)?.label ?? s;

export const ACTIVITY_KINDS: { id: CrmActivity["kind"]; label: string }[] = [
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "text", label: "Text" },
  { id: "meeting", label: "Meeting" },
  { id: "note", label: "Note" },
];

export const companyKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function newContact(fields: Partial<CrmContact> & { company: string }, now: Date = new Date()): CrmContact {
  const at = now.toISOString();
  return {
    source: "manual",
    stage: "prospect",
    activities: [],
    ...fields,
    company: fields.company.trim(),
    id: fields.id ?? uid("crm"),
    createdAt: at,
    updatedAt: at,
  };
}

/** The contact already in the CRM for this company name, if any. */
export function findContact(contacts: CrmContact[], company: string): CrmContact | undefined {
  const key = companyKey(company);
  return key ? contacts.find((c) => companyKey(c.company) === key) : undefined;
}

/** Add a touch to the log, newest first. Reaching out moves a prospect to contacted. */
export function logActivity(c: CrmContact, kind: CrmActivity["kind"], text: string, now: Date = new Date()): CrmContact {
  const activity: CrmActivity = { id: uid("act"), at: now.toISOString(), kind, text: text.trim() };
  const stage = c.stage === "prospect" && kind !== "note" ? "contacted" : c.stage;
  return { ...c, stage, activities: [activity, ...c.activities] };
}

const isoDay = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export type FollowUp = "overdue" | "today" | "upcoming" | null;

export function followUpStatus(c: CrmContact, now: Date = new Date()): FollowUp {
  if (!c.nextFollowUp || c.stage === "lost") return null;
  const today = isoDay(now);
  if (c.nextFollowUp < today) return "overdue";
  if (c.nextFollowUp === today) return "today";
  return "upcoming";
}

/** A follow-up date `days` from now, as YYYY-MM-DD. */
export function followUpIn(days: number, now: Date = new Date()): string {
  return isoDay(new Date(now.getTime() + days * 86400000));
}

export interface CrmSummary {
  /** Monthly revenue from paying clients. */
  mrr: number;
  /** What trials would add if they all convert. */
  trialValue: number;
  byStage: Record<CrmStage, number>;
  /** Follow-ups due today or overdue, oldest first. */
  due: CrmContact[];
  /** Paying ÷ everyone you've pitched (contacted onward). */
  winRate: number | null;
}

export function crmSummary(contacts: CrmContact[], now: Date = new Date()): CrmSummary {
  const byStage: Record<CrmStage, number> = { prospect: 0, contacted: 0, trial: 0, paying: 0, lost: 0 };
  let mrr = 0;
  let trialValue = 0;
  for (const c of contacts) {
    byStage[c.stage] += 1;
    if (c.stage === "paying") mrr += c.monthlyValue ?? 0;
    if (c.stage === "trial") trialValue += c.monthlyValue ?? 0;
  }
  const due = contacts
    .filter((c) => {
      const f = followUpStatus(c, now);
      return f === "overdue" || f === "today";
    })
    .sort((a, b) => (a.nextFollowUp ?? "").localeCompare(b.nextFollowUp ?? ""));
  const pitched = byStage.contacted + byStage.trial + byStage.paying + byStage.lost;
  return { mrr, trialValue, byStage, due, winRate: pitched ? byStage.paying / pitched : null };
}

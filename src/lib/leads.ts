import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { leadSnapshot, type LeadSnapshot } from "./lead-share";
import { TRADES } from "./permit-trades";
import { getContact, getProfile, userInfo } from "./store";
import type { Permit, TradeId } from "./types";

// Permits passed to subcontractors as leads. The prime picks a sub (from the
// bench, or by name and email); the sub opens a private link, sees the lead
// and how to reach the customer, and answers "I'm on it" or "Not for me".

export type LeadShareStatus = "sent" | "viewed" | "taken" | "passed";

export interface LeadShare {
  token: string;
  contactId: string | null;
  toName: string;
  toEmail: string | null;
  permitId: string;
  trade: TradeId;
  status: LeadShareStatus;
  createdAt: string;
  viewedAt: string | null;
  respondedAt: string | null;
  snapshot: LeadSnapshot;
}

interface Row {
  token: string;
  user_id: string;
  contact_id: string | null;
  to_name: string;
  to_email: string | null;
  permit_id: string;
  trade: string;
  status: LeadShareStatus;
  created_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  snapshot: string;
}

const toShare = (r: Row): LeadShare => ({
  token: r.token,
  contactId: r.contact_id,
  toName: r.to_name,
  toEmail: r.to_email,
  permitId: r.permit_id,
  trade: r.trade as TradeId,
  status: r.status,
  createdAt: r.created_at,
  viewedAt: r.viewed_at,
  respondedAt: r.responded_at,
  snapshot: JSON.parse(r.snapshot) as LeadSnapshot,
});

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class LeadShareError extends Error {}

export async function createLeadShare(userId: string, input: { permit: Permit; trade: TradeId; contactId?: string; toName?: string; toEmail?: string; note?: string }): Promise<LeadShare> {
  const { permit, trade } = input;
  if (!TRADES.some((t) => t.id === trade)) throw new LeadShareError("Pick the trade this is a lead for.");
  if (!permit?.id || !permit.address) throw new LeadShareError("Pick a permit with an address.");
  const contact = input.contactId ? await getContact(userId, input.contactId) : null;
  if (input.contactId && !contact) throw new LeadShareError("That sub isn't on your bench.");
  const toName = (contact?.company ?? input.toName ?? "").trim().slice(0, 120);
  if (!toName) throw new LeadShareError("Who is this lead for?");
  const toEmail = (contact?.email ?? input.toEmail ?? "").trim().toLowerCase() || null;
  if (toEmail && !EMAIL.test(toEmail)) throw new LeadShareError("That email doesn't look right.");

  const profile = await getProfile(userId);
  const user = userInfo(userId);
  const from = { company: profile.companyName, name: profile.contactName || user?.name || "", email: profile.email || user?.email || "", phone: profile.phone };
  const now = new Date().toISOString();
  const row: Row = {
    token: randomBytes(24).toString("base64url"),
    user_id: userId,
    contact_id: contact?.id ?? null,
    to_name: toName,
    to_email: toEmail,
    permit_id: permit.id,
    trade,
    status: "sent",
    created_at: now,
    viewed_at: null,
    responded_at: null,
    snapshot: JSON.stringify(leadSnapshot(permit, trade, from, input.note)),
  };
  getDb()
    .prepare("INSERT INTO lead_share (token, user_id, contact_id, to_name, to_email, permit_id, trade, status, created_at, viewed_at, responded_at, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.token, row.user_id, row.contact_id, row.to_name, row.to_email, row.permit_id, row.trade, row.status, row.created_at, row.viewed_at, row.responded_at, row.snapshot);
  // The app logs the send on the bench record (it owns the contact's saves, so the server doesn't write to it).
  return toShare(row);
}

export function listLeadShares(userId: string, permitId?: string): LeadShare[] {
  const db = getDb();
  const rows = (
    permitId
      ? db.prepare("SELECT * FROM lead_share WHERE user_id = ? AND permit_id = ? ORDER BY created_at DESC").all(userId, permitId)
      : db.prepare("SELECT * FROM lead_share WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").all(userId)
  ) as unknown as Row[];
  return rows.map(toShare);
}

function byToken(token: string): Row | null {
  if (!TOKEN.test(token)) return null;
  return (getDb().prepare("SELECT * FROM lead_share WHERE token = ?").get(token) as unknown as Row | undefined) ?? null;
}

/** The lead page's data. Opening it marks the lead viewed. */
export function openLeadShare(token: string): Pick<LeadShare, "status" | "snapshot" | "toName"> | null {
  const row = byToken(token);
  if (!row) return null;
  if (!row.viewed_at) getDb().prepare("UPDATE lead_share SET viewed_at = ?, status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE token = ?").run(new Date().toISOString(), token);
  const s = toShare(row);
  return { status: s.status === "sent" ? "viewed" : s.status, snapshot: s.snapshot, toName: s.toName };
}

/** The sub takes the lead or passes on it; they can change their mind. */
export function respondLeadShare(token: string, answer: "taken" | "passed"): LeadShareStatus | null {
  const row = byToken(token);
  if (!row) return null;
  const now = new Date().toISOString();
  getDb().prepare("UPDATE lead_share SET status = ?, responded_at = ?, viewed_at = COALESCE(viewed_at, ?) WHERE token = ?").run(answer, now, now, token);
  return answer;
}

/** Leads primes have sent to this email, for a subcontractor's account. */
export function leadSharesForEmail(email: string): (Pick<LeadShare, "token" | "status" | "createdAt" | "trade"> & { address: string; city: string; reason: string; from: string })[] {
  const rows = getDb().prepare("SELECT * FROM lead_share WHERE to_email = ? ORDER BY created_at DESC LIMIT 100").all(email.toLowerCase()) as unknown as Row[];
  return rows.map((r) => {
    const s = JSON.parse(r.snapshot) as LeadSnapshot;
    return { token: r.token, status: r.status, createdAt: r.created_at, trade: r.trade as TradeId, address: s.address, city: s.city, reason: s.reason, from: s.from.company || s.from.name };
  });
}

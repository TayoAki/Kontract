import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { quoteSnapshot, validateQuote, type QuoteRequest, type QuoteResponse, type QuoteSnapshot, type QuoteStatus } from "./quote";
import { getProfile, saveDeal } from "./store";
import type { Deal } from "./types";

// Quote links. The prime creates one per sub per bid; the sub opens it without
// an account, sees the scope (never the prime's price), and submits prices.
// The prime's app imports submitted quotes into the bid.

interface Row {
  token: string;
  user_id: string;
  deal_id: string;
  sub_id: string;
  sub_name: string;
  sub_email: string | null;
  status: QuoteStatus;
  created_at: string;
  viewed_at: string | null;
  submitted_at: string | null;
  imported_at: string | null;
  snapshot: string;
  response: string | null;
}

const toRequest = (r: Row): QuoteRequest => ({
  token: r.token,
  dealId: r.deal_id,
  subId: r.sub_id,
  subName: r.sub_name,
  subEmail: r.sub_email,
  status: r.status,
  createdAt: r.created_at,
  viewedAt: r.viewed_at,
  submittedAt: r.submitted_at,
  importedAt: r.imported_at,
  response: r.response ? (JSON.parse(r.response) as QuoteResponse) : null,
});

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/** Create (or refresh) the quote link for one sub on one bid. Saves the bid first so the link always has it. */
export async function createQuoteRequest(userId: string, deal: Deal, subId: string): Promise<QuoteRequest> {
  const sub = deal.subs.find((s) => s.id === subId);
  if (!sub) throw new Error("That subcontractor isn't on this bid.");
  await saveDeal(userId, deal);
  const snapshot = quoteSnapshot(deal, sub, await getProfile(userId));
  const db = getDb();
  const existing = db.prepare("SELECT * FROM quote_request WHERE user_id = ? AND deal_id = ? AND sub_id = ?").get(userId, deal.id, subId) as Row | undefined;
  if (existing) {
    db.prepare("UPDATE quote_request SET snapshot = ?, sub_name = ?, sub_email = ? WHERE token = ?").run(JSON.stringify(snapshot), sub.name, sub.email ?? null, existing.token);
    return toRequest({ ...existing, sub_name: sub.name, sub_email: sub.email ?? null });
  }
  const row: Row = {
    token: randomBytes(24).toString("base64url"),
    user_id: userId,
    deal_id: deal.id,
    sub_id: subId,
    sub_name: sub.name,
    sub_email: sub.email?.toLowerCase() ?? null,
    status: "sent",
    created_at: new Date().toISOString(),
    viewed_at: null,
    submitted_at: null,
    imported_at: null,
    snapshot: JSON.stringify(snapshot),
    response: null,
  };
  db.prepare(
    `INSERT INTO quote_request (token, user_id, deal_id, sub_id, sub_name, sub_email, status, created_at, snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.token, row.user_id, row.deal_id, row.sub_id, row.sub_name, row.sub_email, row.status, row.created_at, row.snapshot);
  return toRequest(row);
}

export function listQuoteRequests(userId: string, dealId?: string): QuoteRequest[] {
  const db = getDb();
  const rows = (
    dealId
      ? db.prepare("SELECT * FROM quote_request WHERE user_id = ? AND deal_id = ? ORDER BY created_at DESC").all(userId, dealId)
      : db.prepare("SELECT * FROM quote_request WHERE user_id = ? ORDER BY created_at DESC").all(userId)
  ) as unknown as Row[];
  return rows.map(toRequest);
}

export function markImported(userId: string, token: string): void {
  getDb().prepare("UPDATE quote_request SET imported_at = ? WHERE token = ? AND user_id = ?").run(new Date().toISOString(), token, userId);
}

export interface PublicQuote {
  snapshot: QuoteSnapshot;
  status: QuoteStatus;
  response: QuoteResponse | null;
}

function byToken(token: string): Row | undefined {
  if (!TOKEN.test(token)) return undefined;
  return getDb().prepare("SELECT * FROM quote_request WHERE token = ?").get(token) as Row | undefined;
}

/** What the sub sees. Opening it marks the request viewed, unless it's the prime previewing. */
export function openQuote(token: string, opts: { preview?: boolean } = {}): PublicQuote | null {
  const row = byToken(token);
  if (!row) return null;
  if (opts.preview) return { snapshot: JSON.parse(row.snapshot) as QuoteSnapshot, status: row.status, response: row.response ? (JSON.parse(row.response) as QuoteResponse) : null };
  if (!row.viewed_at) {
    getDb()
      .prepare("UPDATE quote_request SET viewed_at = ?, status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE token = ?")
      .run(new Date().toISOString(), token);
  }
  return { snapshot: JSON.parse(row.snapshot) as QuoteSnapshot, status: row.status === "sent" ? "viewed" : row.status, response: row.response ? (JSON.parse(row.response) as QuoteResponse) : null };
}

/** Save the sub's prices. Sending again replaces the last quote. */
export function submitQuote(token: string, body: unknown): { ok: true; response: QuoteResponse } | { ok: false; error: string; status: number } {
  const row = byToken(token);
  if (!row) return { ok: false, error: "This quote link doesn't exist.", status: 404 };
  const checked = validateQuote(JSON.parse(row.snapshot) as QuoteSnapshot, body);
  if (!checked.ok) return { ...checked, status: 400 };
  getDb()
    .prepare("UPDATE quote_request SET response = ?, status = 'submitted', submitted_at = ?, viewed_at = COALESCE(viewed_at, ?) WHERE token = ?")
    .run(JSON.stringify(checked.response), checked.response.submittedAt, checked.response.submittedAt, token);
  return checked;
}

/** Quote requests sent to this email, for a subcontractor's own account. */
export function quoteRequestsForEmail(email: string): (QuoteRequest & { jobTitle: string; dueBy: string; primeCompany: string })[] {
  const rows = getDb().prepare("SELECT * FROM quote_request WHERE sub_email = ? ORDER BY created_at DESC LIMIT 100").all(email.toLowerCase()) as unknown as Row[];
  return rows.map((r) => {
    const snap = JSON.parse(r.snapshot) as QuoteSnapshot;
    return { ...toRequest(r), jobTitle: snap.jobTitle, dueBy: snap.dueBy, primeCompany: snap.prime.company };
  });
}

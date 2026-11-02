import assert from "node:assert/strict";
import { test } from "node:test";
import { logActivity, newContact } from "./crm.ts";
import { newDeal } from "./deal.ts";
import { clip, contactRow, dealDetail, dealSummary, dueSoon, opportunityDetail, opportunityRow } from "./mcp-format.ts";
import type { QuoteRequest } from "./quote.ts";
import { sampleOpportunities } from "./sample-data.ts";

const now = new Date("2026-10-28T12:00:00Z");
const opp = sampleOpportunities(now).find((o) => o.id === "DEMO-0001")!;

function priced() {
  const d = newDeal(opp, undefined, now);
  d.pricing.lines[0] = { ...d.pricing.lines[0]!, quantity: 15, subCost: 700, price: 1000 };
  return d;
}

test("clip keeps short text and cuts long text on a word with a count", () => {
  assert.equal(clip("  short   text ", 50), "short text");
  const long = "word ".repeat(100).trim();
  const out = clip(long, 40);
  assert.ok(out.length < 80);
  assert.match(out, /^word word.*… \[\d+ more characters\]$/);
  assert.equal(clip(undefined, 10), "");
});

test("a search row has the fields a model needs and a fit score", () => {
  const r = opportunityRow(opp, now);
  assert.equal(r.id, "DEMO-0001");
  assert.equal(r.level, "federal");
  assert.equal(typeof r.fit.score, "number");
  assert.ok(["Strong fit", "Worth a look", "Hard pass"].includes(r.fit.verdict));
  assert.equal(r.dueDate?.length, 10);
});

test("the detail read explains the score and clips the description", () => {
  const d = opportunityDetail({ ...opp, description: "x ".repeat(5000) }, now);
  assert.ok(d.fit.reasons.length > 0);
  assert.ok(d.description.length < 4100);
  assert.ok(d.read.whoDoesTheWork.length > 0);
});

test("bid summary does the money: price, profit and margin per year", () => {
  const s = dealSummary(priced(), [], now);
  assert.equal(s.price?.yourPrice, 15000);
  assert.equal(s.price?.subCost, 10500);
  assert.equal(s.price?.profit, 4500);
  assert.equal(s.price?.margin, 30);
  assert.equal(s.stage, "Found");
});

test("bid detail shows each shortlisted sub's quote link state", () => {
  const d = priced();
  d.subs = [{ id: "s1", name: "Acme Waste", source: "manual", status: "contacted", vetting: {} }];
  const link = { token: "t", dealId: d.id, subId: "s1", subName: "Acme Waste", subEmail: null, status: "viewed", createdAt: now.toISOString(), viewedAt: now.toISOString(), submittedAt: null, importedAt: null, response: null } satisfies QuoteRequest;
  const out = dealDetail(d, [link], now);
  assert.deepEqual(out.shortlist[0]!.quoteLink, { status: "viewed", opened: true });
  assert.equal(out.quotes.linksMade, 1);
});

test("the bench row shows the newest touch", () => {
  let c = newContact({ company: "Lone Star Fence" }, now);
  c = logActivity(c, "call", "First call", now);
  c = logActivity(c, "email", "Sent the scope", new Date(now.getTime() + 60_000));
  assert.equal(contactRow(c, now).lastActivity?.text, "Sent the scope");
});

test("whats due: open bids within two weeks, overdue follow-ups, quotes not yet in a bid", () => {
  const soon = priced();
  soon.opportunity = { ...soon.opportunity, responseDeadline: "2026-11-02T17:00:00Z" };
  const done = { ...priced(), id: "other", stage: "submitted" as const };
  const c = { ...newContact({ company: "Late Sub" }, now), nextFollowUp: "2026-10-20" };
  const q = { token: "t", dealId: soon.id, subId: "s1", subName: "Acme", subEmail: null, status: "submitted", createdAt: "", viewedAt: null, submittedAt: "2026-10-27T00:00:00Z", importedAt: null, response: null } satisfies QuoteRequest;
  const out = dueSoon([soon, done], [c], [q], now);
  assert.deepEqual(out.bidsDueIn14Days.map((b) => b.id), ["DEMO-0001"]);
  assert.equal(out.followUpsDue[0]!.company, "Late Sub");
  assert.equal(out.quotesNotYetInABid[0]!.sub, "Acme");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyQuote, needsImport, quoteSnapshot, scrubContacts, validateQuote, type QuoteRequest } from "./quote.ts";
import type { CompanyProfile, Deal } from "./types.ts";

const now = new Date("2026-10-28T15:00:00Z");

function deal(): Deal {
  return {
    id: "opp1",
    stage: "sourcing",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    notes: "",
    opportunity: {
      id: "opp1",
      title: "Grounds Maintenance at VA Clinic",
      solicitationNumber: "36C25726Q0001",
      agency: "Veterans Affairs",
      office: "NCO 17",
      postedDate: "2026-10-20",
      responseDeadline: "2026-11-20T17:00:00Z",
      type: "Solicitation",
      setAside: "Total Small Business",
      setAsideCode: "SBA",
      naicsCode: "561730",
      pscCode: "S208",
      placeOfPerformance: { city: "Austin", state: "TX", zip: "78701" },
      contacts: [{ name: "Pat Officer", email: "pat.officer@va.gov", phone: "512-555-0199" }],
      attachments: [],
      description: "Mow and trim weekly. Questions to pat.officer@va.gov or (512) 555-0199.",
      samUrl: "https://sam.gov/opp/opp1/view",
    },
    subs: [{ id: "s1", name: "Green Acres Landscaping", source: "manual", status: "contacted", vetting: {}, crmId: "crm_1" }],
    pricing: {
      periods: 5,
      periodLabel: "year",
      lines: [
        { id: "l1", description: "Mowing and trimming", unit: "visit", quantity: 40, subCost: 0, price: 0 },
        { id: "l2", description: "Leaf removal", unit: "visit", quantity: 4, subCost: 0, price: 0 },
      ],
    },
  };
}

const profile: CompanyProfile = {
  companyName: "Prime Co",
  uei: "",
  cage: "",
  address: "",
  contactName: "Chris",
  contactTitle: "Owner",
  email: "chris@prime.co",
  phone: "555-0100",
  website: "",
  capabilities: "",
  defaultMarkupPct: 30,
};

test("the snapshot a sub sees has the scope and lines but none of your pricing or the customer's contacts", () => {
  const d = deal();
  d.pricing.lines[0]!.subCost = 55;
  d.pricing.lines[0]!.price = 80;
  const snap = quoteSnapshot(d, d.subs[0]!, profile, now);
  const json = JSON.stringify(snap);
  assert.deepEqual(snap.lines, [
    { id: "l1", description: "Mowing and trimming", unit: "visit", quantity: 40 },
    { id: "l2", description: "Leaf removal", unit: "visit", quantity: 4 },
  ]);
  for (const leak of ["subCost", '"price"', "80", "markup", "margin", "pat.officer@va.gov", "555-0199"]) assert.ok(!json.includes(leak), `leaked ${leak}`);
  assert.equal(snap.prime.email, "chris@prime.co", "they reply to you");
  assert.equal(snap.subName, "Green Acres Landscaping");
  assert.match(snap.scope, /Scope of Work: Grounds Maintenance/);
  assert.match(snap.dueBy, /2026/);
});

test("scrubContacts removes emails and phone numbers", () => {
  assert.equal(scrubContacts("Email a.b@c.gov or call (512) 555-0199 / 512.555.0100"), "Email [contact removed] or call [contact removed] / [contact removed]");
});

test("validateQuote needs a number for every line and at least one above zero", () => {
  const snap = quoteSnapshot(deal(), deal().subs[0]!, profile, now);
  assert.deepEqual(validateQuote(snap, { lines: [{ id: "l1", unitPrice: 50 }] }, now), { ok: false, error: 'Enter a price for "Leaf removal".' });
  assert.equal(validateQuote(snap, { lines: [{ id: "l1", unitPrice: 0 }, { id: "l2", unitPrice: 0 }] }, now).ok, false);
  assert.equal(validateQuote(snap, { lines: [{ id: "l1", unitPrice: 50 }, { id: "l2", unitPrice: 120 }], email: "nope" }, now).ok, false);
  const ok = validateQuote(snap, { lines: [{ id: "l1", unitPrice: "50" }, { id: "l2", unitPrice: 120.555 }], insured: true, notes: " 3-person crew " }, now);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.response.total, 40 * 50 + 4 * 120.56);
  assert.equal(ok.response.notes, "3-person crew");
  assert.equal(ok.response.insured, true);
});

test("applyQuote fills an unpriced bid with the sub's prices and your markup", () => {
  const snap = quoteSnapshot(deal(), deal().subs[0]!, profile, now);
  const r = validateQuote(snap, { lines: [{ id: "l1", unitPrice: 50 }, { id: "l2", unitPrice: 100 }], startDate: "Dec 1" }, now);
  assert.ok(r.ok);
  if (!r.ok) return;
  const d = applyQuote(deal(), "s1", r.response, 30);
  assert.equal(d.stage, "quoted");
  assert.deepEqual(d.pricing.lines.map((l) => [l.subCost, l.price]), [[50, 65], [100, 130]]);
  const sub = d.subs[0]!;
  assert.equal(sub.status, "quoted");
  assert.equal(sub.quote, 50);
  assert.equal(sub.quoteTotal, 2400);
  assert.deepEqual(sub.lineQuotes, { l1: 50, l2: 100 });
  assert.match(sub.notes!, /Can start: Dec 1/);
  // A second quote doesn't overwrite pricing you already set.
  const again = applyQuote({ ...d, subs: [...d.subs, { id: "s2", name: "B", source: "manual", status: "contacted", vetting: {} }] }, "s2", { ...r.response, lines: [{ id: "l1", unitPrice: 40 }, { id: "l2", unitPrice: 90 }], total: 1960 }, 30);
  assert.deepEqual(again.pricing.lines.map((l) => l.subCost), [50, 100]);
  assert.equal(again.subs[1]!.quoteTotal, 1960);
});

test("needsImport: submitted and not imported since", () => {
  const base: QuoteRequest = { token: "t", dealId: "d", subId: "s", subName: "S", subEmail: null, status: "submitted", createdAt: "", viewedAt: null, submittedAt: "2026-10-28T10:00:00Z", importedAt: null, response: { lines: [], total: 1, insured: false, submittedAt: "2026-10-28T10:00:00Z" } };
  assert.equal(needsImport(base), true);
  assert.equal(needsImport({ ...base, importedAt: "2026-10-28T11:00:00Z" }), false);
  assert.equal(needsImport({ ...base, importedAt: "2026-10-28T09:00:00Z" }), true, "revised after import");
  assert.equal(needsImport({ ...base, response: null, submittedAt: null, status: "viewed" }), false);
});

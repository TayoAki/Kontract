import assert from "node:assert/strict";
import { test } from "node:test";
import { newDeal } from "./deal.ts";
import { outreachTemplate, priceTable, proposalTemplate, quoteDueDate, sowTemplate, workSummary } from "./templates.ts";
import { sampleOpportunities } from "./sample-data.ts";
import type { CompanyProfile } from "./types.ts";

const now = new Date("2026-10-28T12:00:00Z");
const opp = sampleOpportunities(now).find((o) => o.id === "DEMO-0001")!;
const profile: CompanyProfile = {
  companyName: "Natalie Services LLC",
  uei: "ABCDEF123456",
  cage: "1AB23",
  address: "Miami, FL",
  contactName: "Natalie",
  contactTitle: "Owner",
  email: "natalie@natalieservices.com",
  phone: "(555) 010-0000",
  website: "",
  capabilities: "",
  defaultMarkupPct: 35,
};

function priced() {
  const d = newDeal(opp, undefined, now);
  d.pricing.lines[0] = { ...d.pricing.lines[0]!, quantity: 15, subCost: 700, price: 1500 };
  return d;
}

test("drafts sent to subs or the government never mention your margin", () => {
  const d = priced();
  for (const text of [sowTemplate(d, profile, now), outreachTemplate(d, profile, undefined, now), proposalTemplate(d, profile, now)]) {
    assert.doesNotMatch(text, /margin|markup|on top/i);
  }
  // ...and the scope for subs doesn't leak your price.
  assert.doesNotMatch(sowTemplate(d, profile, now), /1,500|\$1500/);
});

test("price table totals per year and over the contract", () => {
  const t = priceTable(priced());
  assert.match(t, /\| Waste pickup & disposal \| pickup \| 15 \| \$1,500\.00 \| \$22,500\.00 \|/);
  assert.match(t, /Total, 5 years\*\* \| \| \| \| \*\*\$112,500\.00/);
});

test("work summary and quote due date", () => {
  assert.equal(workSummary(priced(), now), "Formalin waste pickup and disposal services in Long Beach, CA, estimated at 15 pickups per year. Term: 1 base year + 4 option years.");
  // Government deadline is 16 days out, so quotes are due 4 days before it.
  assert.match(quoteDueDate(opp.responseDeadline, now), /Nov 9, 2026/);
  assert.equal(quoteDueDate(null, now), "[quote due date]");
});

test("proposal fills company info and leaves placeholders for gaps", () => {
  const text = proposalTemplate(priced(), { ...profile, cage: "" }, now);
  assert.match(text, /\| UEI \| ABCDEF123456 \|/);
  assert.match(text, /\| CAGE code \| \[CAGE code\] \|/);
  assert.match(text, /Dear Jordan Ellis/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { newDeal } from "./deal.ts";
import { outreachTemplate, priceTable, proposalTemplate, quoteDueDate, sowTemplate, workSummary } from "./templates.ts";
import { rulesBreakdown } from "./rules.ts";
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
  assert.equal(workSummary(priced(), now), "Formalin Waste Pickup and Disposal Services in Long Beach, CA, estimated at 15 pickups per year. Term: 1 base year + 4 option years.");
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

test("proposal asks to acknowledge the amendments SAM.gov posted", () => {
  const d = priced();
  d.opportunity = { ...d.opportunity, versions: 3 };
  assert.match(proposalTemplate(d, profile, now), /Acknowledges all 2 amendment\(s\)/);
});

test("customerDetails keeps the work, drops contracting boilerplate and contacts", async () => {
  const { customerDetails } = await import("./templates.ts");
  const d = "Description This is a combined synopsis/solicitation for commercial services prepared in accordance with the format in FAR subpart 12.201-1. Simplified Procedures , as supplemented with additional information included in this notice. The FSC/PSC is: S201 Housekeeping Custodial Janitorial. This solicitation is set-aside for SDVOSB. The NAICS code is 561720. The VA Bedford Healthcare System, 200 Springs Road, Bedford, MA 01730 is seeking vendors that can provide window cleaning services for the campus. Windows must be cleaned inside and out twice a year. Questions to earl.johnson1@va.gov or 781-687-2000.";
  assert.equal(customerDetails(d), "The VA Bedford Healthcare System, 200 Springs Road, Bedford, MA 01730 is seeking vendors that can provide window cleaning services for the campus. Windows must be cleaned inside and out twice a year.");
});

test("titles keep their names; only all-caps titles are calmed down", async () => {
  const { sentenceCase } = await import("./templates.ts");
  assert.equal(sentenceCase("Swan Lake Ranger District Janitorial Contract"), "Swan Lake Ranger District Janitorial Contract");
  assert.equal(sentenceCase("JANITORIAL SERVICES FOR THE VA CBOC BLDG 12"), "Janitorial services for the VA CBOC bldg 12");
});

test("the scope sent to subs has no blanks for what we don't know", () => {
  const d = priced();
  d.breakdown = { ...rulesBreakdown(d.opportunity, now), contractLength: "Check the notice for the period of performance" };
  const text = sowTemplate(d, { ...profile, companyName: "", phone: "" }, now);
  assert.match(text, /\*\*Request for quote\*\*/);
  assert.match(text, /natalie@natalieservices\.com\n/);
  assert.doesNotMatch(text, /\[(your company name|phone|company)\]|Check the notice|## Term/);
});

test("outreach reads naturally when the notice is vague", () => {
  const d = priced();
  d.breakdown = { ...rulesBreakdown(d.opportunity, now), contractLength: "Check the notice for the period of performance", subcontractorSearchTerms: ["commercial cleaning company"] };
  const text = outreachTemplate(d, profile, undefined, now);
  assert.match(text, /Do you take on commercial cleaning work in Long Beach, CA\?/);
  assert.match(text, /We're bidding on a government job there and need a local partner\. Can I email/);
  assert.doesNotMatch(text, /check the notice/i);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetLabel, extractBidDetails, findBudget, firstDate, parseMoney } from "./bid-details.ts";

const now = new Date("2026-10-28T12:00:00Z");
const read = (docs: { name: string; text: string }[]) => extractBidDetails("n1", docs, docs.map((d, i) => ({ id: String(i), name: d.name, url: "", size: null, postedDate: null, read: "read" as const })), "fp", now);

test("parseMoney and budgetLabel", () => {
  assert.equal(parseMoney("$1,000,000.00"), 1_000_000);
  assert.equal(parseMoney("$1.5 million"), 1_500_000);
  assert.equal(parseMoney("$500K"), 500_000);
  assert.equal(budgetLabel({ low: 1e6, high: 2e6, kind: "magnitude" }), "$1M–$2M");
  assert.equal(budgetLabel({ low: null, high: 25_000, kind: "magnitude" }), "Under $25K");
  assert.equal(budgetLabel({ low: null, high: 250_000, kind: "ceiling" }), "Up to $250K");
  assert.equal(budgetLabel({ low: 1.25e6, high: 1.25e6, kind: "estimate" }), "About $1.3M");
});

test("magnitude: a stated range, a checked box on a list, and an unchecked list", () => {
  const stated = findBudget([{ name: "RFQ.docx", text: "In accordance with VAAR 836.204(f)(1), the disclosure of the magnitude of construction project is between $1,000,000.00\nand $2,000,000.00 \nNext section." }]);
  assert.deepEqual(stated?.value, { low: 1_000_000, high: 2_000_000, kind: "magnitude" });
  assert.equal(stated?.doc, "RFQ.docx");
  assert.match(stated!.quote, /^magnitude of construction project is between \$1,000,000\.00 and \$2,000,000\.00/);

  const list = "Magnitude of construction:\n☐ Less than $25,000\n☐ Between $25,000 and $100,000\n☒ Between $250,000 and $500,000\n☐ Between $500,000 and $1,000,000\n☐ More than $10,000,000";
  assert.deepEqual(findBudget([{ name: "SF1442", text: list }])?.value, { low: 250_000, high: 500_000, kind: "magnitude" });
  assert.equal(findBudget([{ name: "SF1442", text: list.replace("☒", "☐") }]), null, "no box checked: don't guess");

  const est = findBudget([{ name: "PWS", text: "The estimated contract value is $480,000 over five years." }]);
  assert.deepEqual(est?.value, { low: 480_000, high: 480_000, kind: "estimate" });
  assert.equal(findBudget([{ name: "RFQ", text: "Orders not to exceed the micro-purchase threshold of $10,000 per clause 52.213." }]), null);
  assert.equal(findBudget([{ name: "specs.pdf", text: "Permit fees are *one (1) percent of contract amount not to exceed $10,000 5.3 ASBESTOS ABATEMENT" }]), null, "a fee cap isn't the budget");
  assert.deepEqual(findBudget([{ name: "RFP", text: "The total contract value shall not exceed $750,000 over the base and option years." }])?.value, { low: null, high: 750_000, kind: "ceiling" });
});

test("the facts from a VA roof replacement notice", () => {
  const notice =
    "Amendment 0001: This amendment provides the attendees list for the pre-solicitation site visit conducted on October 27, 2026 at Palo Alto VA Medical Center. " +
    "The period of performance is 180 calendar days after NTP. All requests for information (RFI) regarding this RFQ must be submitted in writing and receive no later than November 3, 2026 at 2:00 PM PDT. " +
    "Bid bonds, payment and performance bonds are required under this solicitation. A bid guarantee in the form of a bid bond must be submitted with the proposal; the bid guarantee shall be 20 percent of the bid price. " +
    "A comparative analysis approach will be used. DBA Wage Determination No. CA20260018 dated 20260917 is applicable.";
  const rfq = "Roof Replacement of approximately 12,000 SF of flat roof sections at Building 347. Apply 2 lbs/100 sq. ft. of primer. (d) evidence of insurance without exclusionary clauses for asbestos (End of Clause)";
  const specs = "Work must be phased. Base bid includes all BID ITEMS including ASBESTOS ABATEMENT. OSHA 10-hour training is required for all workers on site. Lead based paints are prohibited. Normal working hours are 7:00 a.m. to 3:30 p.m.";
  const d = read([{ name: "Notice", text: notice }, { name: "RFQ.docx", text: rfq }, { name: "Specs.pdf", text: specs }, { name: "Attachment C - Price Breakdown.xlsx", text: "## Sheet1\nDivision 01 - General Requirements | Labor\nDivision 07 - Roofing | Material\nGrand Total:" }]);
  assert.deepEqual(d.siteVisit?.value, { date: "2026-10-27", mandatory: false });
  assert.equal(d.questionsDue?.value, "2026-11-03");
  assert.equal(d.period?.value, "180 calendar days after notice to proceed");
  assert.deepEqual(d.bonds?.value, ["Bid bond (20% of your price)", "Performance bond", "Payment bond"]);
  assert.match(d.evaluation!.value, /^Comparative analysis/);
  assert.deepEqual(d.wageDeterminations, ["CA20260018"]);
  assert.deepEqual(d.sizes.map((s) => s.value), ["12,000 sq ft"], "rates like lbs/100 sq ft aren't sizes");
  const reqs = Object.fromEntries(d.requirements.map((r) => [r.value, r.doc]));
  assert.equal(reqs["Asbestos abatement or handling"], "Specs.pdf", "the insurance clause doesn't count; the bid item does");
  assert.ok(reqs["OSHA 10 for workers"]);
  assert.ok(reqs["Set working hours"]);
  assert.equal(reqs["Lead paint work"], undefined, "a prohibition isn't lead work");
  assert.deepEqual(d.priceForm, { doc: "Attachment C - Price Breakdown.xlsx", rows: ["Division 01 - General Requirements", "Division 07 - Roofing"] });
  assert.ok(d.forms.includes("Attachment C - Price Breakdown.xlsx"));
});

test("firstDate reads month names and numeric dates", () => {
  assert.equal(firstDate("on Tuesday, October 27, 2026 at 09:00"), "2026-10-27");
  assert.equal(firstDate("by Sept. 3, 2026"), "2026-09-03");
  assert.equal(firstDate("due 11/03/2026 2pm"), "2026-11-03");
  assert.equal(firstDate("no date here"), null);
});

test("bonds not required, and nothing found", () => {
  assert.deepEqual(read([{ name: "Notice", text: "Bonds are not required for this requirement." }]).bonds?.value, []);
  const empty = read([{ name: "Notice", text: "Provide janitorial services." }]);
  assert.equal(empty.budget, null);
  assert.equal(empty.bonds, null);
  assert.equal(empty.siteVisit, null);
});

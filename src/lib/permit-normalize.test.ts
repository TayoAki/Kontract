import assert from "node:assert/strict";
import { test } from "node:test";
import { contractorName, dateWhere, filterPermits, groupByAddress, normalizePermit, permitContractors, permitDate, titleCase } from "./permit-normalize.ts";
import { subInvite } from "./permit-pitch.ts";
import { feedsFor, marketForCity, marketsForState, PERMIT_MARKETS, permitSource, PERMIT_SOURCES, selectedFields } from "./permit-sources.ts";

const now = new Date("2026-10-28T15:00:00Z");

test("the register: unique feeds with a state, date field, cadence and verification date", () => {
  const ids = new Set(PERMIT_SOURCES.map((s) => s.id));
  assert.equal(ids.size, PERMIT_SOURCES.length);
  for (const s of PERMIT_SOURCES) {
    assert.match(s.state, /^[A-Z]{2}$/);
    assert.ok(selectedFields(s).includes(s.date), s.id);
    assert.ok(s.map.address.length > 0, s.id);
    assert.match(s.lastVerified, /^\d{4}-\d{2}-\d{2}$/, s.id);
    assert.ok(["several-daily", "daily", "weekly"].includes(s.cadence), s.id);
    assert.ok(PERMIT_MARKETS.some((m) => m.id === s.market && m.feeds.includes(s.id)), s.id);
  }
  assert.ok(marketsForState("TX").length >= 3);
});

test("one city can need several feeds", () => {
  const sf = PERMIT_MARKETS.find((m) => m.id === "san-francisco-ca")!;
  assert.deepEqual(sf.feeds, ["san-francisco-ca", "san-francisco-permitsf"]);
  assert.equal(feedsFor({ market: "new-york-ny" }).length, 2);
  assert.equal(feedsFor({ state: "CA" }).length, 4, "a state query covers every feed in it");
  assert.equal(marketForCity("Austin", "TX")?.id, "austin-tx");
  assert.equal(marketForCity("San Francisco", "CA")?.id, "san-francisco-ca");
  assert.equal(marketForCity("Houston", "TX"), undefined);
});

test("titleCase and permitDate", () => {
  assert.equal(titleCase("1755 N FOREST AVE"), "1755 N Forest Ave");
  assert.equal(titleCase("Already Mixed Case"), "Already Mixed Case");
  assert.equal(titleCase("otc alterations permit"), "Otc alterations permit");
  assert.equal(permitDate("2026-10-27T00:00:00.000"), "2026-10-27");
  assert.equal(permitDate("10/27/26", "mdyy"), "2026-10-27");
  assert.equal(permitDate("9/3/26", "mdyy"), "2026-09-03");
  assert.equal(permitDate("garbage"), null);
});

test("dateWhere builds a range, or a list of text dates for Dallas", () => {
  assert.equal(dateWhere(permitSource("austin-tx")!, 7, now), "issue_date >= '2026-10-22T00:00:00' AND issue_date <= '2026-10-28T23:59:59'");
  const dallas = dateWhere(permitSource("dallas-tx")!, 2, now);
  assert.match(dallas, /^issued_date in \(/);
  assert.ok(dallas.includes("'10/27/26'") && dallas.includes("'10/28/26'"));
});

test("normalizePermit maps an Austin row", () => {
  const p = normalizePermit(permitSource("austin-tx")!, {
    permit_number: "2026-123456 BP",
    permit_type_desc: "Building Permit",
    work_class: "New",
    description: "New single family residence with attached garage",
    original_address1: "1203 W 6TH ST",
    original_city: "AUSTIN",
    original_zip: "78703",
    total_job_valuation: "485000",
    issue_date: "2026-10-27T00:00:00.000",
    contractor_company_name: "HILL COUNTRY HOMES LLC",
    contractor_phone: "(512) 555-0100",
    link: { url: "https://abc.austintexas.gov/web/permit/public-search-other?t_detail=1&t_selected_folderrsn=1" },
    permit_class_mapped: "Residential",
  })!;
  assert.equal(p.id, "austin-tx:2026-123456 BP");
  assert.equal(p.market, "austin-tx");
  assert.equal(p.issuedDate, "2026-10-27");
  assert.equal(p.type, "Building Permit · New");
  assert.equal(p.address, "1203 W 6TH St");
  assert.equal(p.city, "Austin");
  assert.equal(p.zip, "78703");
  assert.equal(p.value, 485000);
  assert.equal(p.contractor, "Hill Country Homes LLC");
  assert.equal(p.contractorPhone, "(512) 555-0100");
  assert.equal(p.residential, true);
  assert.match(p.url, /^https:\/\/abc\.austintexas\.gov/);
  assert.ok(p.trades.some((t) => t.trade === "landscaping"));
  assert.equal(p.trades.find((t) => t.trade === "blinds")?.strength, "strong");
});

test("NYC electrical permits carry the firm, license and insurance", () => {
  const p = normalizePermit(permitSource("new-york-electrical")!, {
    job_filing_number: "B01467552-I1-EL",
    filing_type: "New Job Filing",
    house_number: "5510",
    street_name: "5 AVENUE",
    borough: "Brooklyn",
    zip_code: "11220",
    firm_name: "RICHARD NEU",
    license_number: "011545",
    general_liability_expiration: "2027-10-07T00:00:00.000",
    job_description: "Rewire 2 apartments",
    permit_issued_date: "2026-10-27T00:00:00.000",
  })!;
  assert.equal(p.market, "new-york-ny");
  assert.equal(p.type, "Electrical permit · New Job Filing");
  assert.equal(p.contractor, "Richard Neu");
  assert.equal(p.contractorLicense, "011545");
  assert.equal(p.insuredUntil, "2027-10-07");
  assert.deepEqual(p.trades, [], "an electrical permit isn't a lead for other trades");
});

test("normalizePermit reads Chicago's numbered contacts and Everett's one-line address", () => {
  const c = normalizePermit(permitSource("chicago-il")!, {
    permit_: "100999",
    permit_type: "PERMIT - NEW CONSTRUCTION",
    work_description: "ERECT 2 STORY SINGLE FAMILY RESIDENCE",
    street_number: "2045",
    street_direction: "N",
    street_name: "OAKLEY AVE",
    issue_date: "2026-10-27T00:00:00.000",
    reported_cost: "800000",
    contact_1_type: "OWNER",
    contact_1_name: "JANE DOE",
    contact_2_type: "CONTRACTOR-GENERAL CONTRACTOR",
    contact_2_name: "NORTH SIDE BUILDERS INC",
  })!;
  assert.equal(c.address, "2045 N Oakley Ave");
  assert.equal(c.contractor, "North Side Builders INC");
  assert.equal(c.owner, "Jane Doe");
  assert.equal(c.url, "https://data.cityofchicago.org/d/ydr8-5enu");
  const e = normalizePermit(permitSource("everett-wa")!, { permitno: "B2610", permittype: "RESIDENTIAL BUILDING", permitsubtype: "NEW DUPLEX (2-UNIT DWELLING)", siteaddress: "1604 CEDAR AVE, EVERETT, WA, 98201", issueddate: "2026-10-27T00:00:00.000", jobvalue: "200000", contractorname: "N/A" })!;
  assert.equal(e.address, "1604 Cedar Ave");
  assert.equal(e.zip, "98201");
  assert.equal(e.contractor, undefined, "placeholder contractor names are dropped");
  assert.equal(normalizePermit(permitSource("everett-wa")!, { siteaddress: "x" }), null, "no date");
});

const sample = () =>
  [
    { permit_number: "A", permit_type_desc: "Building Permit", work_class: "New", description: "New single family residence", original_address1: "1 A ST", original_zip: "78701", total_job_valuation: "500000", issue_date: "2026-10-27T00:00:00.000", contractor_company_name: "Acme Homes", permit_class_mapped: "Residential" },
    { permit_number: "B", permit_type_desc: "Building Permit", work_class: "Pool", description: "New in-ground pool", original_address1: "2 B ST", original_zip: "78702", total_job_valuation: "60000", issue_date: "2026-10-26T00:00:00.000", contractor_company_name: "ACME HOMES", permit_class_mapped: "Residential" },
    { permit_number: "C", permit_type_desc: "Electrical Permit", work_class: "Service", description: "Panel upgrade", original_address1: "3 C ST", original_zip: "78701", total_job_valuation: "3000", issue_date: "2026-10-27T00:00:00.000", permit_class_mapped: "Commercial" },
  ].map((r) => normalizePermit(permitSource("austin-tx")!, r)!);

test("filterPermits by trade, value, zip and keyword, and counts per trade", () => {
  const all = sample();
  const fence = filterPermits(all, { days: 7, trade: "fence" });
  assert.equal(fence.addresses, 3);
  assert.deepEqual(fence.permits.map((p) => p.number), ["A", "B"]);
  assert.equal(fence.byTrade.fence, 2);
  assert.equal(fence.byTrade.pool, 1);
  assert.deepEqual(filterPermits(all, { days: 7, minValue: 100000 }).permits.map((p) => p.number), ["A"]);
  assert.deepEqual(filterPermits(all, { days: 7, zip: "78701" }).permits.map((p) => p.number), ["A", "C"]);
  assert.deepEqual(filterPermits(all, { days: 7, q: "pool" }).permits.map((p) => p.number), ["B"]);
  assert.deepEqual(filterPermits(all, { days: 7, residentialOnly: true }).permits.map((p) => p.number), ["A", "B"]);
  const leads = filterPermits(all, { days: 7, leadsOnly: true });
  assert.deepEqual(leads.permits.map((p) => p.number), ["A", "B"], "the panel upgrade isn't a lead");
  assert.equal(leads.scanned, 3);
  const strong = filterPermits(all, { days: 7, leadsOnly: true, minStrength: "strong" });
  assert.deepEqual(strong.byTrade, { blinds: 1, cleaning: 1, fence: 1, patio: 1 }, "only sure tags count");
});

test("several permits at one address are one lead", () => {
  const s = permitSource("austin-tx")!;
  const row = (n: string, type: string, desc: string, date: string, value?: string) =>
    normalizePermit(s, { permit_number: n, permit_type_desc: type, work_class: "New", description: desc, original_address1: "9 Oak St", original_zip: "78704", issue_date: `${date}T00:00:00.000`, total_job_valuation: value, contractor_company_name: "Oak Builders", permit_class_mapped: "Residential" })!;
  const permits = [
    row("1", "Building Permit", "New single family residence", "2026-10-25", "420000"),
    row("2", "Electrical Permit", "New service for new home", "2026-10-26"),
    row("3", "Plumbing Permit", "Rough-in for new home", "2026-10-27"),
  ];
  const [lead, ...others] = groupByAddress(permits);
  assert.equal(others.length, 0);
  assert.equal(lead!.number, "1", "the permit with trade tags leads");
  assert.equal(lead!.issuedDate, "2026-10-27", "dated by the newest permit");
  assert.equal(lead!.value, 420000);
  assert.deepEqual(lead!.related!.map((r) => r.number).sort(), ["2", "3"]);
  const r = filterPermits(permits, { days: 7 });
  assert.equal(r.total, 1);
  assert.equal(r.scanned, 3);
  assert.equal(permitContractors(permits)[0]!.jobs, 1, "three permits, one job");
  assert.equal(permitContractors(permits)[0]!.permits, 3);
});

test("permitContractors groups by business, or by who does the trade's own work", () => {
  const c = permitContractors(sample());
  assert.equal(c.length, 1);
  assert.equal(c[0]!.key, "acmehomes");
  assert.equal(c[0]!.permits, 2);
  assert.equal(c[0]!.latest, "2026-10-27");
  const pool = permitContractors(sample(), "pool");
  assert.equal(pool[0]!.permits, 1, "only the pool permit is pool work");
  assert.deepEqual(permitContractors(sample(), "roofing"), []);
});

test("quoted and placeholder contractor names are cleaned", () => {
  const s = permitSource("cincinnati-oh")!;
  const row = { permitnum: "1", permittypemapped: "Building", description: "Addition", originaladdress1: "1 MAIN ST", issueddate: "2026-10-26T00:00:00.000" };
  assert.equal(normalizePermit(s, { ...row, companyname: '"LEGACY CUSTOM BUILDERS LLC"' })!.contractor, "Legacy Custom Builders LLC");
  assert.equal(normalizePermit(s, { ...row, companyname: '"OWNER"' })!.contractor, undefined);
  assert.equal(normalizePermit(s, { ...row, companyname: "Owner/Builder" })!.contractor, undefined);
  assert.equal(normalizePermit(s, { ...row, companyname: "Paradisa Homes, LLC***MAIN***" })!.contractor, "Paradisa Homes, LLC");
  assert.equal(normalizePermit(s, { ...row, companyname: "Hoch Construction LLC.(MAIN)" })!.contractor, "Hoch Construction LLC.");
  assert.equal(contractorName("Michael Mc Nulty Construction***Ask Id"), "Michael Mc Nulty Construction");
  assert.equal(contractorName("Owner Builder"), undefined);
  assert.equal(contractorName("  "), undefined);
});

test("permitContractors finds HVAC contractors from mechanical permits", () => {
  const s = permitSource("austin-tx")!;
  const mech = normalizePermit(s, { permit_number: "M1", permit_type_desc: "Mechanical Permit", work_class: "Remodel", description: "Replace 3-ton AC unit and furnace", original_address1: "5 Elm St", issue_date: "2026-10-27T00:00:00.000", contractor_company_name: "Cool Air LLC" })!;
  const bldg = normalizePermit(s, { permit_number: "B1", permit_type_desc: "Building Permit", work_class: "Remodel", description: "Kitchen remodel", original_address1: "6 Elm St", issue_date: "2026-10-27T00:00:00.000", contractor_company_name: "Kitchen Pros" })!;
  assert.deepEqual(permitContractors([mech, bldg], "hvac").map((c) => c.name), ["Cool Air LLC"]);
  assert.deepEqual(permitContractors([mech, bldg], "general").map((c) => c.name), ["Kitchen Pros"]);
});

test("the invite leads with a real permit, free leads and jobs to quote", () => {
  const [home] = sample();
  const { subject, body } = subInvite({ work: "fence", marketName: "Austin", permit: home, company: "Lone Star Fence Co", profile: { contactName: "Chris", companyName: "Kontract Services" }, joinUrl: "https://k.example/join?ref=u1", freePerWeek: 10, dailyPrice: 99, now });
  assert.equal(subject, "Free fence leads in Austin, plus jobs to quote");
  assert.match(body, /^Hi Lone Star Fence team,/, "legal suffixes are dropped");
  assert.match(body, /hire local fence companies/);
  assert.match(body, /10 new fence leads a week from building permits in Austin, free\./);
  assert.match(body, /Yesterday's list had this one: a \$500K building permit at 1 A St \(78701\): "New single family residence"\. Most new homes get a fence/);
  assert.match(body, /Our jobs to quote/);
  assert.match(body, /Join here: https:\/\/k\.example\/join\?ref=u1/);
  assert.match(body, /\$99\/month, cancel anytime/);
  const hvac = subInvite({ work: "hvac", marketName: "Austin", contactName: "Maria Lopez", joinUrl: "https://k.example/join", freePerWeek: 10, dailyPrice: 99 });
  assert.match(hvac.body, /^Hi Maria,/);
  assert.doesNotMatch(hvac.body, /leads a week/, "no permit leads for trades we don't tag");
  assert.equal(hvac.subject, "HVAC work to quote in Austin");
  assert.match(hvac.body, /\[your name\]/);
});

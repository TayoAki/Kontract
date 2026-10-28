import assert from "node:assert/strict";
import { test } from "node:test";
import { dateWhere, filterPermits, normalizePermit, permitContractors, permitDate, titleCase } from "./permit-normalize.ts";
import { permitPitch } from "./permit-pitch.ts";
import { permitSource, PERMIT_SOURCES, selectedFields, sourcesForState } from "./permit-sources.ts";

const now = new Date("2026-10-28T15:00:00Z");

test("every source has a unique id, a state and a date field it selects", () => {
  const ids = new Set(PERMIT_SOURCES.map((s) => s.id));
  assert.equal(ids.size, PERMIT_SOURCES.length);
  for (const s of PERMIT_SOURCES) {
    assert.match(s.state, /^[A-Z]{2}$/);
    assert.ok(selectedFields(s).includes(s.date), s.id);
    assert.ok(s.map.address.length > 0, s.id);
  }
  assert.ok(sourcesForState("TX").length >= 3);
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
});

test("the pitch leads with a real permit and the offer", () => {
  const [home] = sample();
  const { subject, body } = permitPitch({ trade: "fence", marketName: "Austin", permit: home, company: "Lone Star Fence Co", profile: { contactName: "Chris", companyName: "Permit Central" }, price: 99, guaranteeDays: 30, now });
  assert.equal(subject, "New fence leads in Austin, every morning");
  assert.match(body, /^Hi Lone Star Fence team,/, "legal suffixes are dropped");
  assert.match(body, /Yesterday's list had this one: a \$500K building permit at 1 A St \(78701\): "New single family residence"\. /);
  assert.match(body, /Most new homes get a fence/);
  assert.match(body, /\$99\/month/);
  assert.match(body, /30 days, I'll refund it in full/);
  assert.match(permitPitch({ trade: "fence", marketName: "Austin", company: "Zach Savage Homes, LLC", price: 99, guaranteeDays: 30 }).body, /^Hi Zach Savage Homes team,/);
  const shouty = permitPitch({ trade: "fence", marketName: "Austin", permit: { ...home!, description: "NEW SINGLE FAMILY HOME." }, price: 99, guaranteeDays: 30, now });
  assert.match(shouty.body, /: "New single family home"\./);
  const pool = permitPitch({ trade: "pool", marketName: "Austin", contactName: "Maria Lopez", company: "Blue Pools", price: 99, guaranteeDays: 30 });
  assert.match(pool.body, /^Hi Maria,/);
  assert.match(pool.body, /\[your name\]/);
  assert.equal(pool.subject, "New pool leads in Austin, every morning");
  const [, , electric] = sample();
  const old = permitPitch({ trade: "pool", marketName: "Austin", permit: { ...electric!, value: undefined, type: "Electrical Permit", issuedDate: "2026-10-01" }, price: 99, guaranteeDays: 30, now });
  assert.match(old.body, /A recent list had this one: an electrical permit/);
});

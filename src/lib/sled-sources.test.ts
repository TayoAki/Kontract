import assert from "node:assert/strict";
import { test } from "node:test";
import { fitScore, serviceOf } from "./fit-score.ts";
import { searchOpportunities } from "./opportunity-search.ts";
import { BID_SOURCES } from "./sled-sources.ts";
import type { Opportunity } from "./types.ts";

const src = (id: string) => BID_SOURCES.find((s) => s.id === id)!;
const now = new Date("2026-10-28T15:00:00Z");

test("every bid feed is registered with a filter for open bids", () => {
  assert.equal(new Set(BID_SOURCES.map((s) => s.id)).size, BID_SOURCES.length);
  for (const s of BID_SOURCES) {
    assert.match(s.where("2026-10-28"), /2026-10-28T00:00:00/, s.id);
    assert.match(s.state, /^[A-Z]{2}$/);
  }
});

test("LA RAMP rows become biddable local opportunities", () => {
  const o = src("la-ramp").normalize({
    rampid: "231294",
    title: "Standard- and Medium-Duty Towing and Storage Services, Service Area 3 for LAPD",
    stagename: "Open",
    category: "Personal Services",
    type: "RFP - Request For Proposal",
    bidpost: "2026-09-21T19:00:00.000",
    closedate: "2026-11-12T23:00:00.000",
    department: "Police",
    url: { url: "https://www.rampla.org/s/opportunity-details?id=006Ql00000jN34vIAC" },
  })!;
  assert.equal(o.id, "sled:la-ramp:231294");
  assert.equal(o.source, "sled");
  assert.equal(o.level, "local");
  assert.equal(o.portal, "RAMP LA");
  assert.equal(o.agency, "Police");
  assert.equal(o.responseDeadline, "2026-11-12T23:00:00");
  assert.deepEqual(o.placeOfPerformance, { city: "Los Angeles", state: "CA" });
  assert.equal(o.serviceKind, "service");
  assert.equal(serviceOf(o), true);
  assert.match(o.samUrl, /rampla\.org/);
  assert.ok(fitScore(o, now).criteria.find((c) => c.key === "type")!.level === "good", "a solicitation is biddable");
});

test("NYC City Record keeps the contact, strips HTML and the PIN prefix", () => {
  const o = src("nyc-city-record").normalize({
    request_id: "20260924016",
    agency_name: "Correction",
    category_description: "Services (other than human services)",
    short_title: "07227B0002-On-Call Mechanical Equipment and Systems",
    selection_method_description: "Competitive Sealed Bids",
    pin: "07227B0002",
    due_date: "2026-10-30T11:00:00.000",
    start_date: "2026-10-01T00:00:00.000",
    contact_name: "Jane Roe",
    contact_phone: "(718) 555-0100",
    email: "jroe@doc.nyc.gov",
    additional_description_1: "<p>Provide on-call&nbsp;mechanical repairs.</p><p>Pre-bid at Rikers.</p>",
  })!;
  assert.equal(o.title, "On-Call Mechanical Equipment and Systems");
  assert.equal(o.contacts[0]!.email, "jroe@doc.nyc.gov");
  assert.match(o.description!, /Provide on-call mechanical repairs\./);
  assert.doesNotMatch(o.description!, /<p>/);
});

test("Delaware uses UNSPSC to tell services from products; Montgomery marks its small-business reserve", () => {
  const svc = src("delaware-open-bids").normalize({ contractnumber: "DOT262219-SAH", contracttitle: "Sponsor A Highway", opendate: "2026-09-29T00:00:00.000", deadlinedate: "2026-10-29T00:00:00.000", agencycode: "DOT", unspsc: "8110" })!;
  const buses = src("delaware-open-bids").normalize({ contractnumber: "DOE27003-BUSES", contracttitle: "School Buses", deadlinedate: "2026-10-29T00:00:00.000", unspsc: "2510" })!;
  assert.equal(svc.serviceKind, "service");
  assert.equal(buses.serviceKind, "product");
  const mc = src("montgomery-md-solicitations").normalize({ number: "1202214", description: "Marketing and Outreach", issuancedate: "2026-10-12T00:00:00.000", closingdate: "2026-11-03T00:00:00.000", lsbrpindicator: "Y", department: "DEP", deptcontact: "DEP Procurements Team", type: "Informal" })!;
  assert.equal(mc.setAside, "Local Small Business Reserve Program");
  assert.ok(fitScore(mc, now).criteria.find((c) => c.key === "setaside")!.level === "good");
});

test("search can mix federal and state/local, or pick one", () => {
  const fed = { id: "f1", title: "Grounds maintenance", source: "bulk", type: "Solicitation", postedDate: "2026-10-20", responseDeadline: "2026-11-20", placeOfPerformance: { state: "CA" }, pscCode: "S208", attachments: null, agency: "VA", office: "", solicitationNumber: "1", setAside: null, setAsideCode: null, naicsCode: null, contacts: [], samUrl: "" } as Opportunity;
  const local = src("la-ramp").normalize({ rampid: "9", title: "Tree trimming", category: "Personal Services", type: "RFB", closedate: "2026-11-20T00:00:00.000", bidpost: "2026-10-20T00:00:00.000" })!;
  const all = [fed, local];
  assert.equal(searchOpportunities(all, { biddableOnly: true }, { now }).total, 2);
  assert.equal(searchOpportunities(all, { level: "sled" }, { now }).results[0]!.id, local.id);
  assert.equal(searchOpportunities(all, { level: "federal" }, { now }).results[0]!.id, "f1");
  assert.equal(searchOpportunities(all, {}, { now }).sledTotal, 1);
});

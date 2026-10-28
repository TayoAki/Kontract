import assert from "node:assert/strict";
import { test } from "node:test";
import { closesOut, htmlToText, keepForSearch, mergeVersions, normalizeBulkRow, parseSamDate, parseSetAsideCode, prettyName, versionKey, type BulkRow } from "./sam-normalize.ts";

const now = new Date("2026-10-28T18:00:00Z");

// Shaped like a row of ContractOpportunitiesFullCSV.csv (synthetic values).
const row = (patch: BulkRow = {}): BulkRow => ({
  NoticeId: "eaeab2b2f7fe4b1390ba867d0f8d3dbc",
  Title: "GROUNDS MAINTENANCE SERVICES",
  "Sol#": "140R8126Q0001",
  "Department/Ind.Agency": "INTERIOR, DEPARTMENT OF THE",
  "Sub-Tier": "BUREAU OF RECLAMATION",
  Office: "DENVER ACQUISITION OFFICE",
  PostedDate: "2026-10-27 11:27:28",
  Type: "Combined Synopsis/Solicitation",
  BaseType: "Combined Synopsis/Solicitation",
  SetASideCode: "SBA",
  SetASide: "Total Small Business Set-Aside (FAR 19.5)",
  ResponseDeadLine: "2026-11-13T16:00:00-07:00",
  NaicsCode: "561730",
  ClassificationCode: "S208",
  PopCity: "LAKEWOOD",
  PopState: "CO",
  PopZip: "80225",
  PopCountry: "USA",
  Active: "Yes",
  PrimaryContactTitle: "Contract Specialist",
  PrimaryContactFullname: "Pat Example",
  PrimaryContactEmail: "pat@example.gov",
  PrimaryContactPhone: "555-0100",
  SecondaryContactFullname: "",
  SecondaryContactEmail: "",
  State: "CO",
  City: "Denver",
  ZipCode: "80225",
  CountryCode: "USA",
  Link: "https://sam.gov/workspace/contract/opp/eaeab2b2f7fe4b1390ba867d0f8d3dbc/view",
  Description: "Mow and trim 40 acres.\r\nBase year plus four option years.",
  ...patch,
});

test("prettyName flips and title-cases SAM.gov agency names", () => {
  assert.equal(prettyName("VETERANS AFFAIRS, DEPARTMENT OF"), "Department of Veterans Affairs");
  assert.equal(prettyName("INTERIOR, DEPARTMENT OF THE"), "Department of the Interior");
  assert.equal(prettyName("262-NETWORK CONTRACT OFFICE 22 (36C262)"), "262-Network Contract Office 22 (36C262)");
  assert.equal(prettyName("Already Mixed Case"), "Already Mixed Case");
  assert.equal(prettyName("HVAC MAINTENANCE FOR THE VA"), "HVAC Maintenance for the VA");
});

test("parseSamDate handles every format in the extract", () => {
  assert.equal(parseSamDate("2026-11-13T16:00:00-08:00", "deadline"), "2026-11-14T00:00:00.000Z");
  assert.equal(parseSamDate("2026-11-13T16:00:00", "deadline"), "2026-11-13T21:00:00.000Z");
  assert.equal(parseSamDate("2026-10-27 11:27:28", "posted"), "2026-10-27T16:27:28.000Z");
  assert.equal(parseSamDate("2026-11-13", "deadline"), "2026-11-14T04:59:00.000Z");
  assert.equal(parseSamDate("2026-11-13", "posted"), "2026-11-13T17:00:00.000Z");
  assert.equal(parseSamDate("", "deadline"), null);
  assert.equal(parseSamDate("not a date", "deadline"), null);
});

test("parseSetAsideCode", () => {
  assert.equal(parseSetAsideCode("SBA"), "SBA");
  assert.equal(parseSetAsideCode('["SBA"]'), "SBA");
  assert.equal(parseSetAsideCode("NONE"), null);
  assert.equal(parseSetAsideCode(""), null);
});

test("normalizeBulkRow maps a CSV row", () => {
  const o = normalizeBulkRow(row())!;
  assert.equal(o.title, "Grounds Maintenance Services");
  assert.equal(o.agency, "Department of the Interior");
  assert.equal(o.office, "Denver Acquisition Office");
  assert.equal(o.solicitationNumber, "140R8126Q0001");
  assert.equal(o.setAsideCode, "SBA");
  assert.equal(o.setAside, "Total Small Business Set-Aside (FAR 19.5)");
  assert.deepEqual(o.placeOfPerformance, { city: "Lakewood", state: "CO", zip: "80225", country: "USA" });
  assert.equal(o.placeFromOffice, undefined);
  assert.equal(o.responseDeadline, "2026-11-13T23:00:00.000Z");
  assert.deepEqual(o.contacts, [{ name: "Pat Example", title: "Contract Specialist", email: "pat@example.gov", phone: "555-0100" }]);
  assert.equal(o.attachments, null, "the extract doesn't list attachments");
  assert.equal(o.description, "Mow and trim 40 acres.\nBase year plus four option years.");
  assert.equal(o.samUrl, "https://sam.gov/opp/eaeab2b2f7fe4b1390ba867d0f8d3dbc/view");
  assert.equal(o.source, "bulk");
});

test("normalizeBulkRow falls back to the office location and drops 'no set aside'", () => {
  const o = normalizeBulkRow(row({ PopState: "", PopCity: "", PopZip: "", PopCountry: "", SetASideCode: "NONE", SetASide: "No Set aside used" }))!;
  assert.deepEqual(o.placeOfPerformance, { city: "Denver", state: "CO", zip: "80225", country: "USA" });
  assert.equal(o.placeFromOffice, true);
  assert.equal(o.setAside, null);
  assert.equal(o.setAsideCode, null);
  assert.equal(normalizeBulkRow(row({ NoticeId: "" })), null);
});

test("normalizeBulkRow strips HTML descriptions", () => {
  assert.equal(normalizeBulkRow(row({ Description: "<p>Hello&nbsp;<b>world</b></p>" }))!.description, "Hello world");
});

test("keepForSearch keeps open bids and recent notices without a deadline", () => {
  const open = normalizeBulkRow(row())!;
  assert.equal(keepForSearch(open, now), true);
  assert.equal(keepForSearch({ ...open, responseDeadline: "2026-10-27T00:00:00.000Z" }, now), false, "closed");
  assert.equal(keepForSearch({ ...open, type: "Award Notice" }, now), false);
  assert.equal(keepForSearch({ ...open, type: "Sources Sought", responseDeadline: null }, now), true);
  assert.equal(keepForSearch({ ...open, responseDeadline: null, postedDate: "2026-06-01T00:00:00.000Z" }, now), false, "stale, no deadline");
});

test("htmlToText", () => {
  assert.equal(htmlToText("<p>Hello&nbsp;<b>world</b></p><ul><li>one</li><li>two</li></ul><script>x()</script>"), "Hello world\n• one\n• two");
});

test("titles lose a leading product/service code", () => {
  assert.equal(normalizeBulkRow(row({ Title: "Z1DZ--Replace Roof at Building 347" }))!.title, "Replace Roof at Building 347");
  assert.equal(normalizeBulkRow(row({ Title: "S201-- JANITORIAL SERVICES" }))!.title, "Janitorial Services");
});

test("mergeVersions keeps the newest amendment and counts versions", () => {
  const base = normalizeBulkRow(row())!;
  const v1: [typeof base, string] = [{ ...base, id: "v1", postedDate: "2026-10-20T00:00:00.000Z", responseDeadline: "2026-11-10T00:00:00.000Z" }, "Full scope of work. ".repeat(20)];
  const v2: [typeof base, string] = [{ ...base, id: "v2", postedDate: "2026-10-25T00:00:00.000Z", responseDeadline: "2026-11-13T23:00:00.000Z" }, "Amendment 1 extends the deadline."];
  const other: [typeof base, string] = [{ ...base, id: "x", solicitationNumber: "OTHER-123" }, "Different solicitation"];
  const merged = mergeVersions([v1, v2, other]);
  assert.equal(merged.length, 2);
  const [o, d] = merged.find(([m]) => m.id === "v2")!;
  assert.equal(o.versions, 2);
  assert.equal(o.responseDeadline, "2026-11-13T23:00:00.000Z", "current deadline from the newest version");
  assert.match(d!, /^Amendment 1 extends the deadline\.\n\nEarlier version of this notice:\nFull scope/);
  assert.equal(merged.find(([m]) => m.id === "x")![0].versions, undefined);
});

test("mergeVersions drops awarded and cancelled solicitations", () => {
  const base = normalizeBulkRow(row())!;
  const open: [typeof base, string] = [base, "Scope"];
  const cancelled: [typeof base, string] = [{ ...base, id: "c", title: "Amendment 0002 – Cancellation Notice", postedDate: "2026-10-28T00:00:00.000Z" }, ""];
  assert.equal(mergeVersions([open, cancelled]).length, 0);
  const closedAt = new Map([[versionKey(base), "2026-10-28T00:00:00.000Z"]]);
  assert.equal(mergeVersions([open], closedAt).length, 0, "an award notice posted later closes it");
  const olderAward = new Map([[versionKey(base), "2026-01-01T00:00:00.000Z"]]);
  assert.equal(mergeVersions([open], olderAward).length, 1, "an earlier award (e.g. last year's contract) doesn't");
  assert.equal(closesOut({ ...base, type: "Award Notice" }), true);
});

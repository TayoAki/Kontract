import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToText, normalizeNotice, prettyName } from "./sam-normalize.ts";

test("prettyName flips and title-cases SAM.gov agency names", () => {
  assert.equal(prettyName("VETERANS AFFAIRS, DEPARTMENT OF"), "Department of Veterans Affairs");
  assert.equal(prettyName("262-NETWORK CONTRACT OFFICE 22 (36C262)"), "262-Network Contract Office 22 (36C262)");
  assert.equal(prettyName("Already Mixed Case"), "Already Mixed Case");
  assert.equal(prettyName("HVAC MAINTENANCE FOR THE VA"), "HVAC Maintenance for the VA");
});

test("normalizeNotice maps the v2 search payload", () => {
  const o = normalizeNotice({
    noticeId: "abc123",
    title: "FORMALIN WASTE DISPOSAL",
    solicitationNumber: "36C26226Q0001",
    fullParentPathName: "VETERANS AFFAIRS, DEPARTMENT OF.VETERANS AFFAIRS, DEPARTMENT OF.262-NETWORK CONTRACT OFFICE 22 (36C262)",
    postedDate: "2026-10-20",
    type: "Combined Synopsis/Solicitation",
    typeOfSetAsideDescription: "Total Small Business Set-Aside (FAR 19.5)",
    typeOfSetAside: "SBA",
    responseDeadLine: "2026-11-05T14:00:00-08:00",
    naicsCode: "562211",
    classificationCode: "S222",
    pointOfContact: [{ fullName: "Jane Doe", email: "jane@va.gov", phone: "555" }, { fax: "1" } as never],
    placeOfPerformance: { city: { name: "LONG BEACH" }, state: { code: "CA" }, zip: "90822" },
    description: "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc123",
    uiLink: "https://sam.gov/opp/abc123/view",
    resourceLinks: ["https://sam.gov/a", "https://sam.gov/b"],
  });
  assert.equal(o.title, "Formalin Waste Disposal");
  assert.equal(o.agency, "Department of Veterans Affairs");
  assert.equal(o.office, "262-Network Contract Office 22 (36C262)");
  assert.equal(o.placeOfPerformance.city, "Long Beach");
  assert.equal(o.placeOfPerformance.state, "CA");
  assert.equal(o.responseDeadline, "2026-11-05T22:00:00.000Z");
  assert.equal(o.contacts.length, 1);
  assert.equal(o.attachments.length, 2);
  assert.equal(o.descriptionUrl, "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc123");
  assert.equal(o.description, undefined);
});

test("normalizeNotice falls back to the office address and tolerates nulls", () => {
  const o = normalizeNotice({ noticeId: "x", officeAddress: { city: "DENVER", state: "CO", zipcode: "80225" }, pointOfContact: null, resourceLinks: null, responseDeadLine: null });
  assert.equal(o.placeOfPerformance.state, "CO");
  assert.equal(o.responseDeadline, null);
  assert.deepEqual(o.attachments, []);
});

test("htmlToText", () => {
  assert.equal(htmlToText("<p>Hello&nbsp;<b>world</b></p><ul><li>one</li><li>two</li></ul><script>x()</script>"), "Hello world\n• one\n• two");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { contactPage, findEmails, findLicenses, findPhones, findServices, siteFacts } from "./site-facts.ts";

const home = `# Green Acres Fence & Gate
Proudly serving Austin, Round Rock and Cedar Park since 2004.

## Our services
- Wood fence installation
- Iron gates and automatic openers
- [Pool safety fencing](/pool-fence)
- Contact us
- Reviews

Licensed, bonded and insured. TX Lic. #FENCE-12345. 18 years of experience.
Call (512) 555-0101 or 512.448.9001. Email info@greenacresfence.com
![logo](logo@2x.png) support@sentry.io`;

test("emails: printed or mailto, not images or trackers", () => {
  assert.deepEqual(findEmails(home, ["mailto:Sam@GreenAcresFence.com?subject=Quote", "/about"]), ["sam@greenacresfence.com", "info@greenacresfence.com"]);
});

test("phones: real numbers, formatted, no 555 fakes", () => {
  assert.deepEqual(findPhones(home, ["tel:+1-512-448-9001"]), ["(512) 448-9001"]);
});

test("licenses as printed", () => {
  assert.deepEqual(findLicenses("CSLB Lic. #1023456 · ROC 312345 · TACLA12345C · License No: B-77812"), ["CSLB Lic. #1023456", "ROC 312345", "TACLA12345C", "License No: B-77812"]);
  assert.deepEqual(findLicenses(home), ["Lic. #FENCE-12345"]);
  assert.deepEqual(findLicenses("- **Master Plumbing License #:**\nM-42438\n- **HVAC License #:**\n- **Electrical License #:**"), ["Master Plumbing License #: M-42438"]);
});

test("services from headings and short list items", () => {
  assert.deepEqual(findServices(home), ["Wood fence installation", "Iron gates and automatic openers", "Pool safety fencing"]);
});

test("siteFacts puts it together; contactPage finds the contact link on the same site", () => {
  const f = siteFacts("https://greenacresfence.com", [{ url: "https://greenacresfence.com", markdown: home, links: [] }], new Date("2026-10-29T12:00:00Z"));
  assert.equal(f.serviceArea, "Austin, Round Rock and Cedar Park since 2004");
  assert.equal(f.insured, true);
  assert.equal(f.experience, "since 2004");
  assert.equal(contactPage("https://www.greenacresfence.com/", ["https://facebook.com/x", "https://greenacresfence.com/about-us", "/contact-us"]), "/contact-us");
  assert.equal(contactPage("https://a.com", ["https://b.com/contact"]), null);
});

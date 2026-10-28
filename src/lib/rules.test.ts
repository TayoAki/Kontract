import assert from "node:assert/strict";
import { test } from "node:test";
import { awardKeywords, cleanTitle, guessPeriods, rulesBreakdown, scanRequirements, subSearchTerms } from "./rules.ts";
import { sampleOpportunities } from "./sample-data.ts";

const now = new Date("2026-10-28T12:00:00Z");
const byId = Object.fromEntries(sampleOpportunities(now).map((o) => [o.id, o]));

test("cleanTitle drops trailing location and solicitation numbers", () => {
  assert.equal(cleanTitle("Grounds Maintenance and Landscaping Services - Denver Federal Center"), "Grounds Maintenance and Landscaping Services");
  assert.equal(cleanTitle("Aircraft Seat Assembly Parts, NSN 1680-01-555-0100"), "Aircraft Seat Assembly Parts NSN");
  assert.equal(cleanTitle("Project No. 640A0-27-104, Replace Roof at Building 347 - Menlo Park"), "Replace Roof at Building 347");
  assert.equal(cleanTitle("36C24127Q0017 Windows Washing Service"), "Windows Washing Service");
});

test("category keywords for pricing and sub search", () => {
  assert.deepEqual(awardKeywords(byId["DEMO-0001"]!), ["hazardous waste", "waste disposal"]);
  assert.equal(subSearchTerms(byId["DEMO-0002"]!)[0], "catering company");
  assert.equal(subSearchTerms(byId["DEMO-0003"]!)[0], "commercial landscaping");
  // Unknown category falls back to title words
  assert.deepEqual(awardKeywords({ title: "Widget Calibration Services", description: "" }), ["widget calibration"]);
  for (const k of awardKeywords({ title: "A B", description: "" })) assert.ok(k.length > 0);
});

test("categories match whole words, not pieces of other words", () => {
  const steam = { title: "NTX Steam Trap Monitoring", description: "It is important to report through the portal. Transportation provided. Removing old traps." };
  assert.equal(subSearchTerms(steam)[0], "commercial HVAC contractor");
  assert.equal(subSearchTerms({ title: "Porta-John Rental", description: "" })[0], "portable toilet rental");
  assert.notEqual(subSearchTerms({ title: "Debris Removal", description: "Removing debris weekly." })[0], "moving company");
});

test("guessPeriods reads base + option years", () => {
  assert.deepEqual(guessPeriods("a base year plus four (4) one-year option periods"), { periods: 5, label: "1 base year + 4 option years" });
  assert.deepEqual(guessPeriods("One base year and 2 option years."), { periods: 3, label: "1 base year + 2 option years" });
  assert.equal(guessPeriods("This is a 5-year contract").periods, 5);
  assert.equal(guessPeriods("during a two-week annual training event").periods, 1);
  assert.equal(guessPeriods(undefined).periods, null);
});

test("requirements scan", () => {
  const r = scanRequirements("Contractor must hold a valid EPA ID and carry general liability insurance.");
  assert.ok(r.some((x) => x.includes("EPA")));
  assert.ok(r.some((x) => x.includes("insurance")));
});

test("rules breakdown for the formalin sample", () => {
  const b = rulesBreakdown(byId["DEMO-0001"]!, now);
  assert.equal(b.source, "rules");
  assert.equal(b.workType, "service");
  assert.equal(b.periods, 5);
  assert.equal(b.suggestedLines[0]!.unit, "pickup");
  assert.equal(b.difficulty, "easy");
  assert.ok(b.plainEnglish.includes("Long Beach, CA"));
});

test("rules breakdown flags a product buy", () => {
  const b = rulesBreakdown(byId["DEMO-0009"]!, now);
  assert.equal(b.workType, "product");
  assert.ok(b.redFlags.some((f) => f.includes("product")));
  assert.equal(b.difficulty, "hard");
});

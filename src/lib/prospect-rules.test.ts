import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanProspects, nextRunAllowed, normalizeWebsite, sampleProspects, type RawProspect } from "./prospect-rules.ts";

const now = new Date("2026-10-28T15:00:00Z");

test("normalizeWebsite accepts bare domains and rejects junk and private hosts", () => {
  assert.equal(normalizeWebsite("acmefence.com"), "https://acmefence.com");
  assert.equal(normalizeWebsite(" https://www.acme.com/about/ "), "https://www.acme.com/about");
  assert.equal(normalizeWebsite("not a url"), null);
  assert.equal(normalizeWebsite("http://localhost:3000"), null);
  assert.equal(normalizeWebsite("http://10.0.0.1"), null);
  assert.equal(normalizeWebsite("ftp://acme.com"), null);
});

test("runs are limited: weekly on free, daily on the daily plan", () => {
  assert.equal(nextRunAllowed("free", undefined, now), null);
  assert.equal(nextRunAllowed("free", "2026-10-25T15:00:00Z", now), "2026-11-01T15:00:00.000Z");
  assert.equal(nextRunAllowed("free", "2026-10-20T15:00:00Z", now), null);
  assert.equal(nextRunAllowed("daily", "2026-10-28T10:00:00Z", now), "2026-10-29T10:00:00.000Z");
  assert.equal(nextRunAllowed("daily", "2026-10-27T10:00:00Z", now), null);
});

const raw = (over: Partial<RawProspect> = {}): RawProspect => ({
  company: "Northwind Robotics, Inc.",
  website: "https://northwind.example",
  kind: "funding",
  signal: "Raised a $14M Series A",
  signalUrl: "https://news.example/northwind",
  signalDate: "2026-10-20",
  whyFit: "Opening a second warehouse in Austin.",
  location: "Austin, TX",
  fundingAmount: "$14M",
  fundingRound: "Series A",
  people: [{ name: "Ana Ruiz", title: "CEO", linkedin: "https://www.linkedin.com/in/anaruiz", email: "ana@northwind.example" }],
  outreachSubject: "Congrats on the Series A",
  outreachBody: "Hi Ana, ...",
  ...over,
});

test("cleanProspects keeps sourced prospects, dedupes, and drops guessed emails", () => {
  const research = "Press release: contact ana@northwind.example for media. ...";
  const out = cleanProspects(
    [
      raw(),
      raw({ company: "NORTHWIND ROBOTICS" }), // duplicate
      raw({ company: "No Source Co", signalUrl: "" }), // no source
      raw({ company: "Guessy LLC", people: [{ name: "Bo", email: "bo@guessy.example", linkedin: "https://evil.example/in/bo" }] }),
      raw({ company: "Already Found" }),
    ],
    research,
    [{ company: "Already Found" }],
    now,
  );
  assert.deepEqual(out.map((p) => p.company), ["Northwind Robotics, Inc.", "Guessy LLC"]);
  assert.equal(out[0]!.people[0]!.email, "ana@northwind.example", "published on a page it read");
  assert.equal(out[0]!.funding?.amount, "$14M");
  assert.equal(out[1]!.people[0]!.email, undefined, "never seen in the research: dropped");
  assert.equal(out[1]!.people[0]!.linkedin, undefined, "not a LinkedIn URL");
  assert.equal(out[0]!.status, "new");
});

test("sample output is labeled", () => {
  const s = sampleProspects("https://acme.com", now);
  assert.ok(s.prospects.every((p) => p.sample && p.company.startsWith("Sample:")));
  assert.match(s.profile.summary, /ANTHROPIC_API_KEY/);
});

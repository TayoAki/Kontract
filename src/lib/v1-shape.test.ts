import assert from "node:assert/strict";
import { test } from "node:test";
import type { BidDetails } from "./types.ts";
import { trimDetails, withoutDescription } from "./v1-shape.ts";
import { sampleOpportunities } from "./sample-data.ts";

const long = "Bidders shall ".repeat(100);
const details: BidDetails = {
  noticeId: "n1",
  readAt: "2026-11-02T00:00:00Z",
  fingerprint: "f",
  documents: [],
  budget: { value: { low: 1_000_000, high: 2_000_000, kind: "magnitude" }, quote: long, doc: "SOW.pdf" },
  bonds: null,
  siteVisit: null,
  questionsDue: null,
  period: null,
  wageDeterminations: [],
  evaluation: null,
  sizes: [],
  requirements: Array.from({ length: 3000 }, (_, i) => ({ value: `Requirement ${i}`, quote: long, doc: "SOW.pdf" })),
  forms: [],
  priceForm: null,
};

test("every cited sentence is cut to 300 characters", () => {
  const out = trimDetails(details, 10_000_000);
  assert.ok(out.budget!.quote.length <= 300);
  assert.ok(out.requirements.every((r) => r.quote.length <= 300));
  assert.equal(out.budget!.value.high, 2_000_000);
});

test("a details response stays under 200 KB", () => {
  const out = trimDetails(details);
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 200_000);
  assert.ok(out.requirements.length > 0);
});

test("search results drop the description", () => {
  const o = { ...sampleOpportunities()[0]!, description: "Long text" };
  assert.equal("description" in withoutDescription(o), false);
});

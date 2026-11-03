import assert from "node:assert/strict";
import { test } from "node:test";
import type { BidDetails } from "./types.ts";
import { pageText, quoteList, textPaging, trimDetails, withoutDescription } from "./v1-shape.ts";
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

test("text pages join back into the whole text, end after a paragraph break, and the last has no next", () => {
  const whole = Array.from({ length: 300 }, (_, i) => `Paragraph ${i} ${"word ".repeat(i % 17)}`).join("\n\n");
  for (const limit of [1, 50, 333, 5000]) {
    const pages: string[] = [];
    let offset: number | null = 0;
    let n = 0;
    while (offset !== null) {
      const p = pageText(whole, offset, limit);
      assert.equal(p.offset, offset);
      assert.ok(p.text.length <= limit && p.text.length > 0);
      if (p.nextOffset !== null && limit >= 50) assert.ok(/\n\n$/.test(p.text) || /\n$|\s$/.test(p.text), "cut at a break");
      pages.push(p.text);
      offset = p.nextOffset;
      assert.ok(++n < 100_000);
    }
    assert.equal(pages.join(""), whole);
  }
  assert.deepEqual(pageText("short", 0, 40_000), { offset: 0, nextOffset: null, text: "short" });
  assert.deepEqual(pageText("short", 99, 10), { offset: 5, nextOffset: null, text: "" });
  assert.ok(pageText(whole, 0, 5000).text.endsWith("\n\n"));
});

test("text paging and quote lists are checked", () => {
  assert.deepEqual(textPaging(null), { offset: 0, limit: 40_000 });
  assert.deepEqual(textPaging({ offset: 10, limit: 200_000 }), { offset: 10, limit: 80_000 });
  for (const bad of [{ offset: -1 }, { limit: 0 }, { offset: "5" }, { limit: 1.5 }]) assert.equal(typeof textPaging(bad), "string");
  assert.deepEqual(quoteList([{ quote: "Contractor shall clean", doc: "SOW.pdf" }, { quote: "x" }]), [
    { quote: "Contractor shall clean", doc: "SOW.pdf" },
    { quote: "x", doc: null },
  ]);
  for (const bad of [undefined, [], "q", [{ quote: 5 }], [{ quote: "a".repeat(1001) }], [{ quote: "ok", doc: 3 }], Array.from({ length: 101 }, () => ({ quote: "ok" }))]) {
    assert.equal(typeof quoteList(bad), "string");
  }
});

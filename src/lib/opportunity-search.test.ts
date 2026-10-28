import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "./format.ts";
import { searchOpportunities } from "./opportunity-search.ts";
import { sampleOpportunities } from "./sample-data.ts";

const now = new Date("2026-10-28T12:00:00Z");
const all = sampleOpportunities(now);
const ids = (r: { results: { id: string }[] }) => r.results.map((o) => o.id);

test("default search: open service bids, best fit first", () => {
  const r = searchOpportunities(all, { servicesOnly: true, biddableOnly: true }, { now });
  assert.ok(!ids(r).includes("DEMO-0009"), "product buy filtered out");
  assert.ok(!ids(r).includes("DEMO-0008"), "sources sought filtered out");
  assert.equal(r.results[0]!.id, "DEMO-0001", "the 100-point sample ranks first");
  assert.equal(r.total, r.results.length);
});

test("keywords match titles and descriptions, all words required", () => {
  assert.deepEqual(ids(searchOpportunities(all, { q: "formalin" }, { now })), ["DEMO-0001"]);
  assert.deepEqual(ids(searchOpportunities(all, { q: "ServSafe" }, { now })), ["DEMO-0002"], "only in the description");
  assert.deepEqual(ids(searchOpportunities(all, { q: "formalin catering" }, { now })), []);
  const viaLookup = searchOpportunities(
    all.map((o) => ({ ...o, description: undefined })),
    { q: "ServSafe" },
    { now, descriptionOf: (o) => all.find((x) => x.id === o.id)!.description },
  );
  assert.deepEqual(ids(viaLookup), ["DEMO-0002"], "descriptions can come from a separate store");
});

test("state, NAICS prefix, set-aside and time-to-respond filters", () => {
  assert.deepEqual(ids(searchOpportunities(all, { state: "CO" }, { now })), ["DEMO-0003"]);
  assert.deepEqual(ids(searchOpportunities(all, { naics: "5617" }, { now })).sort(), ["DEMO-0003", "DEMO-0005", "DEMO-0006", "DEMO-0008"]);
  assert.deepEqual(ids(searchOpportunities(all, { setAside: "WOSB" }, { now })), ["DEMO-0005"]);
  assert.ok(searchOpportunities(all, { minDaysToRespond: 20 }, { now }).results.every((o) => Date.parse(o.responseDeadline!) >= addDays(now, 20).getTime()));
});

test("closed notices never show up", () => {
  const closed = { ...all[0]!, id: "closed", responseDeadline: addDays(now, -1).toISOString() };
  assert.ok(!ids(searchOpportunities([...all, closed], {}, { now })).includes("closed"));
});

test("sorting and paging", () => {
  const byDeadline = searchOpportunities(all, { sort: "deadline" }, { now }).results;
  assert.ok(byDeadline.every((o, i) => i === 0 || o.responseDeadline! >= byDeadline[i - 1]!.responseDeadline!));
  const newest = searchOpportunities(all, { sort: "newest" }, { now }).results;
  assert.ok(newest.every((o, i) => i === 0 || o.postedDate <= newest[i - 1]!.postedDate));
  const p1 = searchOpportunities(all, {}, { now, limit: 4 });
  const p2 = searchOpportunities(all, {}, { now, limit: 4, offset: 4 });
  assert.equal(p1.results.length, 4);
  assert.equal(p2.offset, 4);
  assert.equal(p1.total, all.length);
  assert.equal(new Set([...ids(p1), ...ids(p2)]).size, 8);
});

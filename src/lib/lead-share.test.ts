import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPhone, leadLetter, leadMessage, leadSnapshot, mapUrl, reachPlan } from "./lead-share.ts";
import type { Permit } from "./types.ts";

const permit = (over: Partial<Permit> = {}): Permit => ({
  id: "austin-tx:1",
  sourceId: "austin-tx",
  market: "austin-tx",
  number: "2026-001",
  issuedDate: "2026-10-27",
  type: "Residential Pool Permit",
  description: "New in-ground pool and spa",
  address: "1802 Crossing Pl",
  city: "Austin",
  state: "TX",
  zip: "78741",
  value: 85_000,
  residential: true,
  url: "https://data.austintexas.gov/x",
  trades: [{ trade: "fence", reason: "A new pool needs a safety fence.", strength: "strong" }],
  ...over,
});

test("the reach plan uses what the permit has, best first", () => {
  assert.deepEqual(reachPlan(permit({ contractor: "Blue Haven Pools", contractorPhone: "512-555-0100" }), "fence").map((s) => s.kind), ["call", "mail", "door", "record"]);
  assert.equal(reachPlan(permit({ contractor: "Blue Haven Pools" }), "fence")[0]!.kind, "lookup");
  const none = reachPlan(permit(), "fence");
  assert.deepEqual(none.map((s) => s.kind), ["mail", "door", "record"]);
  assert.match(none[0]!.text, /Current resident/);
  assert.match(reachPlan(permit({ owner: "Pat Lee" }))[0]!.text, /Pat Lee at 1802 Crossing Pl/);
  assert.ok(!reachPlan(permit({ residential: false })).some((s) => s.kind === "door"), "no door-knocking commercial sites");
});

test("the lead a sub gets: the permit, the reason, how to reach them, and who sent it", () => {
  const s = leadSnapshot(permit({ contractor: "Blue Haven Pools" }), "fence", { company: "Prime Co", name: "Chris", email: "chris@prime.co", phone: "555-0100" }, "  Call me if you take it ");
  assert.equal(s.tradeLabel, "Fence");
  assert.equal(s.reason, "A new pool needs a safety fence.");
  assert.equal(s.note, "Call me if you take it");
  assert.equal(s.mapUrl, mapUrl(permit()));
  assert.match(s.mapUrl, /1802%20Crossing%20Pl%2C%20Austin%2C%20TX%2C%2078741$/);
  const msg = leadMessage(s, "https://k.app/l/abc", "Sam Sub");
  assert.match(msg, /^Hi Sam, a fence lead for you: 1802 Crossing Pl, Austin\./);
  assert.match(msg, /https:\/\/k\.app\/l\/abc/);
});

test("the letter for a permit with no phone or email", () => {
  const letter = leadLetter({ address: "1802 Crossing Pl", city: "Austin", state: "TX", zip: "78741", type: "Residential Pool Permit", tradeLabel: "Fence" }, { company: "Green Acres Fence", name: "Sam", phone: "512-555-0101", email: "" });
  assert.match(letter, /^Current resident\n1802 Crossing Pl\nAustin, TX 78741/);
  assert.match(letter, /issued a residential pool permit/);
  assert.match(letter, /Green Acres Fence is a local fence company/);
  assert.match(letter, /reach me at 512-555-0101\./);
});

test("formatPhone", () => {
  assert.equal(formatPhone("5124863800"), "(512) 486-3800");
  assert.equal(formatPhone("1-512-486-3800"), "(512) 486-3800");
  assert.equal(formatPhone("ext. 12"), "ext. 12");
  assert.match(reachPlan({ contractor: "A", contractorPhone: "5124863800", address: "x", residential: true, type: "t" })[0]!.text, /\(512\) 486-3800/);
});

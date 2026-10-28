import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyLeads, leadScore, leadsForTrade, newSince, pickWeekly, weeklyLeads, weekStart } from "./sub-leads.ts";
import type { Permit, SignalStrength } from "./types.ts";

const now = new Date("2026-10-28T15:00:00Z"); // a Wednesday

const permit = (id: string, date: string, strength: SignalStrength, value?: number, zip = "78701"): Permit => ({
  id,
  sourceId: "austin-tx",
  market: "austin-tx",
  number: id,
  issuedDate: date,
  type: "Building Permit",
  description: "",
  address: `${id} Main St`,
  city: "Austin",
  state: "TX",
  zip,
  value,
  residential: true,
  url: "",
  trades: [{ trade: "fence", reason: "r", strength }],
});

test("weekStart is the Monday", () => {
  assert.equal(weekStart(now), "2026-10-26");
  assert.equal(weekStart(new Date("2026-11-01T23:00:00Z")), "2026-10-26", "Sunday belongs to the week before");
  assert.equal(weekStart(new Date("2026-11-02T01:00:00Z")), "2026-11-02");
});

test("leadScore prefers sure, big, fresh leads", () => {
  assert.ok(leadScore(permit("a", "2026-10-27", "strong"), "fence", now) > leadScore(permit("b", "2026-10-27", "possible", 2_000_000), "fence", now));
  assert.ok(leadScore(permit("a", "2026-10-27", "likely", 500_000), "fence", now) > leadScore(permit("b", "2026-10-27", "likely", 5_000), "fence", now));
  assert.ok(leadScore(permit("a", "2026-10-28", "likely"), "fence", now) > leadScore(permit("b", "2026-10-22", "likely"), "fence", now));
  assert.equal(leadScore(permit("a", "2026-10-28", "likely"), "pool", now), -1);
});

test("leadsForTrade filters by trade and ZIPs", () => {
  const list = [permit("a", "2026-10-27", "strong"), permit("b", "2026-10-27", "strong", undefined, "78702")];
  assert.equal(leadsForTrade(list, "fence").length, 2);
  assert.deepEqual(leadsForTrade(list, "fence", ["78702"]).map((p) => p.id), ["b"]);
  assert.equal(leadsForTrade(list, "pool").length, 0);
});

test("the free plan's 10 stay fixed for the week and top up when some age out", () => {
  const leads = Array.from({ length: 15 }, (_, i) => permit(`p${i}`, `2026-10-2${i % 8}`, i < 5 ? "strong" : "likely", 10_000 * (i + 1)));
  const first = weeklyLeads(leads, "fence", 10, undefined, now);
  assert.equal(first.picks.length, 10);
  assert.equal(first.weekly.weekStart, "2026-10-26");
  assert.ok(first.picks.slice(0, 5).every((p) => p.trades[0]!.strength === "strong"), "strong leads first");
  // Same week, one lead gone from the window: the other nine stay, one new one fills in.
  const later = weeklyLeads(leads.filter((p) => p.id !== first.picks[0]!.id), "fence", 10, first.weekly, now);
  assert.deepEqual(later.picks.slice(0, 9).map((p) => p.id), first.picks.slice(1).map((p) => p.id));
  assert.equal(later.picks.length, 10);
  // Next week: picked fresh.
  const next = weeklyLeads(leads, "fence", 10, first.weekly, new Date("2026-11-03T15:00:00Z"));
  assert.equal(next.weekly.weekStart, "2026-11-02");
  assert.equal(pickWeekly(leads, "fence", 3, now).length, 3);
});

test("daily plan: newest first; digests only include what's new", () => {
  const list = [permit("old", "2026-10-25", "strong"), permit("new", "2026-10-28", "likely"), permit("mid", "2026-10-27", "strong")];
  assert.deepEqual(dailyLeads(list, "fence", now).map((p) => p.id), ["new", "mid", "old"]);
  assert.deepEqual(newSince(list, "2026-10-27T12:00:00Z", now).map((p) => p.id), ["new", "mid"]);
  assert.deepEqual(newSince(list, undefined, now).map((p) => p.id), ["new", "mid"], "default: the last day");
});

test("digestDue: daily every morning, free on Monday mornings", async () => {
  const { digestDue } = await import("./sub-leads.ts");
  const wed9 = new Date("2026-10-28T09:00:00Z");
  const wed13 = new Date("2026-10-28T13:00:00Z");
  assert.equal(digestDue({ plan: "daily" }, wed9, 12), null, "before the send hour");
  assert.equal(digestDue({ plan: "daily" }, wed13, 12), "daily");
  assert.equal(digestDue({ plan: "daily", lastDigestAt: "2026-10-28T12:05:00Z" }, wed13, 12), null, "already sent today");
  assert.equal(digestDue({ plan: "daily", lastDigestAt: "2026-10-27T12:05:00Z" }, wed13, 12), "daily");
  assert.equal(digestDue({ plan: "free", lastDigestAt: "2026-10-26T12:05:00Z" }, wed13, 12), null, "this Monday's went out");
  assert.equal(digestDue({ plan: "free", lastDigestAt: "2026-10-19T12:05:00Z" }, wed13, 12), "weekly", "missed Monday: send now");
  assert.equal(digestDue({ plan: "free" }, new Date("2026-11-02T11:00:00Z"), 12), null, "Monday before the hour");
});

test("the digest email lists each lead with why and the city link", async () => {
  const { digestEmail } = await import("./digest-email.ts");
  const leads = [permit("a", "2026-10-27", "strong", 60_000), permit("b", "2026-10-26", "likely")];
  leads[0]!.url = "https://city.example/permit/a";
  leads[0]!.description = "New <pool>";
  const e = digestEmail({ kind: "weekly", trade: "fence", tradeLabel: "Fence", marketName: "Austin", leads, appUrl: "https://k.example", freePerWeek: 10, dailyPrice: 99, availableThisWeek: 31 });
  assert.equal(e.subject, "Your 2 best fence leads in Austin this week");
  assert.match(e.text, /1\. a Main St 78701 · Building Permit · \$60K \(issued 2026-10-27\)/);
  assert.match(e.text, /https:\/\/city\.example\/permit\/a/);
  assert.match(e.text, /There were 31 fence leads in Austin this week\. Get every one the morning it's filed for \$99\/month/);
  assert.match(e.html, /New &lt;pool&gt;/, "escaped");
  assert.equal(digestEmail({ kind: "daily", trade: "fence", tradeLabel: "Fence", marketName: "Austin", leads: leads.slice(0, 1), appUrl: "x", freePerWeek: 10, dailyPrice: 99 }).subject, "1 new fence lead in Austin");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { benchSummary, findContact, followUpIn, followUpStatus, logActivity, migrateContact, newContact, recordQuote, subJobs } from "./crm.ts";
import type { CrmContact, Deal, Subcontractor } from "./types.ts";

const now = new Date(2026, 9, 28, 10, 0, 0); // Oct 28, 2026, local time

test("newContact fills defaults and trims the company", () => {
  const c = newContact({ company: "  Lone Star Fence  ", trade: "fence" }, now);
  assert.equal(c.company, "Lone Star Fence");
  assert.equal(c.stage, "found");
  assert.equal(c.source, "manual");
  assert.deepEqual(c.activities, []);
  assert.match(c.id, /^crm_/);
});

test("old subscriber stages map onto the bench", () => {
  const old = (stage: string) => migrateContact({ ...newContact({ company: "A" }, now), stage } as unknown as CrmContact).stage;
  assert.equal(old("prospect"), "found");
  assert.equal(old("contacted"), "contacted");
  assert.equal(old("trial"), "quoted");
  assert.equal(old("paying"), "active");
  assert.equal(old("lost"), "not-a-fit");
  assert.equal(old("active"), "active");
});

test("findContact matches company names loosely", () => {
  const list = [newContact({ company: "Lone Star Fence Co." }, now)];
  assert.equal(findContact(list, "LONE STAR FENCE CO")?.company, "Lone Star Fence Co.");
  assert.equal(findContact(list, "Other Fence"), undefined);
  assert.equal(findContact(list, "..."), undefined);
});

test("logging a call moves a found sub to contacted; a note doesn't; a quote moves them to quoted", () => {
  const c = newContact({ company: "A" }, now);
  assert.equal(logActivity(c, "note", "looked them up", now).stage, "found");
  const called = logActivity(c, "call", " Left a voicemail ", now);
  assert.equal(called.stage, "contacted");
  assert.equal(called.activities[0]!.text, "Left a voicemail");
  const quoted = recordQuote(called, "Grounds maintenance", 12400, now);
  assert.equal(quoted.stage, "quoted");
  assert.match(quoted.activities[0]!.text, /Quoted \$12,400 for "Grounds maintenance"/);
  assert.equal(recordQuote({ ...called, stage: "active" }, "X", null, now).stage, "active", "never moves a sub backwards");
});

test("follow-up status", () => {
  const c = (nextFollowUp?: string, stage: "found" | "not-a-fit" = "found") => ({ ...newContact({ company: "A" }, now), nextFollowUp, stage });
  assert.equal(followUpIn(0, now), "2026-10-28");
  assert.equal(followUpStatus(c("2026-10-27"), now), "overdue");
  assert.equal(followUpStatus(c("2026-10-28"), now), "today");
  assert.equal(followUpStatus(c("2026-11-02"), now), "upcoming");
  assert.equal(followUpStatus(c(undefined), now), null);
  assert.equal(followUpStatus(c("2026-10-01", "not-a-fit"), now), null, "dropped subs don't nag");
});

const sub = (name: string, status: Subcontractor["status"], extra: Partial<Subcontractor> = {}): Subcontractor => ({ id: name, name, source: "manual", status, vetting: {}, ...extra });
const deal = (id: string, stage: Deal["stage"], subs: Subcontractor[]): Deal =>
  ({ id, stage, subs, opportunity: { title: `Job ${id}`, agency: "VA", responseDeadline: `2026-11-0${id}` } }) as unknown as Deal;

test("subJobs lists every bid the sub is on, by link or by name", () => {
  const c = newContact({ company: "Green Acres Landscaping", id: "crm_1" }, now);
  const jobs = subJobs(c, [
    deal("1", "won", [sub("GREEN ACRES LANDSCAPING", "selected", { quote: 9000 })]),
    deal("2", "submitted", [sub("Someone", "quoted", { crmId: "crm_1", quote: 4000 })]),
    deal("3", "found", [sub("Other Co", "quoted")]),
  ]);
  assert.deepEqual(jobs.map((j) => [j.dealId, j.outcome, j.quote]), [["2", "quoted", 4000], ["1", "won", 9000]]);
});

test("benchSummary counts stages, trades, due follow-ups and quote rate", () => {
  const list: CrmContact[] = [
    { ...newContact({ company: "A", trade: "fence" }, now), stage: "active" },
    { ...newContact({ company: "B", trade: "fence" }, now), stage: "quoted", nextFollowUp: "2026-10-28" },
    { ...newContact({ company: "C", trade: "hvac" }, now), stage: "contacted", nextFollowUp: "2026-10-20" },
    { ...newContact({ company: "D" }, now), stage: "found" },
    { ...newContact({ company: "E", trade: "fence" }, now), stage: "not-a-fit" },
  ];
  const s = benchSummary(list, now);
  assert.deepEqual(s.byStage, { found: 1, contacted: 1, quoted: 1, active: 1, "not-a-fit": 1 });
  assert.deepEqual(s.byTrade, { fence: 2, hvac: 1, Other: 1 });
  assert.deepEqual(s.due.map((c) => c.company), ["C", "B"], "overdue first");
  assert.equal(s.quoteRate, 0.5);
  assert.equal(benchSummary([], now).quoteRate, null);
});

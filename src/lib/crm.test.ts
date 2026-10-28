import assert from "node:assert/strict";
import { test } from "node:test";
import { crmSummary, findContact, followUpIn, followUpStatus, logActivity, newContact } from "./crm.ts";

const now = new Date(2026, 9, 28, 10, 0, 0); // Oct 28, 2026, local time

test("newContact fills defaults and trims the company", () => {
  const c = newContact({ company: "  Lone Star Fence  ", trade: "fence" }, now);
  assert.equal(c.company, "Lone Star Fence");
  assert.equal(c.stage, "prospect");
  assert.equal(c.source, "manual");
  assert.deepEqual(c.activities, []);
  assert.match(c.id, /^crm_/);
});

test("findContact matches company names loosely", () => {
  const list = [newContact({ company: "Lone Star Fence Co." }, now)];
  assert.equal(findContact(list, "LONE STAR FENCE CO")?.company, "Lone Star Fence Co.");
  assert.equal(findContact(list, "Other Fence"), undefined);
  assert.equal(findContact(list, "..."), undefined);
});

test("logging a call moves a prospect to contacted; a note doesn't", () => {
  const c = newContact({ company: "A" }, now);
  assert.equal(logActivity(c, "note", "looked them up", now).stage, "prospect");
  const called = logActivity(c, "call", " Left a voicemail ", now);
  assert.equal(called.stage, "contacted");
  assert.equal(called.activities[0]!.text, "Left a voicemail");
  const later = logActivity({ ...called, stage: "paying" }, "email", "Sent the list", now);
  assert.equal(later.stage, "paying", "never moves a client backwards");
  assert.equal(later.activities.length, 2);
  assert.equal(later.activities[0]!.kind, "email", "newest first");
});

test("follow-up status", () => {
  const c = (nextFollowUp?: string, stage: "prospect" | "lost" = "prospect") => ({ ...newContact({ company: "A" }, now), nextFollowUp, stage });
  assert.equal(followUpIn(0, now), "2026-10-28");
  assert.equal(followUpStatus(c("2026-10-27"), now), "overdue");
  assert.equal(followUpStatus(c("2026-10-28"), now), "today");
  assert.equal(followUpStatus(c("2026-11-02"), now), "upcoming");
  assert.equal(followUpStatus(c(undefined), now), null);
  assert.equal(followUpStatus(c("2026-10-01", "lost"), now), null, "lost contacts don't nag");
});

test("crmSummary adds up revenue, stages, due follow-ups and win rate", () => {
  const list = [
    { ...newContact({ company: "A" }, now), stage: "paying" as const, monthlyValue: 99 },
    { ...newContact({ company: "B" }, now), stage: "paying" as const, monthlyValue: 149 },
    { ...newContact({ company: "C" }, now), stage: "trial" as const, monthlyValue: 99, nextFollowUp: "2026-10-28" },
    { ...newContact({ company: "D" }, now), stage: "contacted" as const, nextFollowUp: "2026-10-20" },
    { ...newContact({ company: "E" }, now), stage: "prospect" as const },
  ];
  const s = crmSummary(list, now);
  assert.equal(s.mrr, 248);
  assert.equal(s.trialValue, 99);
  assert.deepEqual(s.byStage, { prospect: 1, contacted: 1, trial: 1, paying: 2, lost: 0 });
  assert.deepEqual(s.due.map((c) => c.company), ["D", "C"], "overdue first");
  assert.equal(s.winRate, 0.5);
  assert.equal(crmSummary([], now).winRate, null);
});

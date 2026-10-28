import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "./format.ts";
import { fitScore, isBiddable, isServiceCode, isSmallBusinessSetAside } from "./fit-score.ts";
import { sampleOpportunities } from "./sample-data.ts";

const now = new Date("2026-10-28T12:00:00Z");
const byId = Object.fromEntries(sampleOpportunities(now).map((o) => [o.id, o]));

test("service vs product codes", () => {
  assert.equal(isServiceCode("S222"), true);
  assert.equal(isServiceCode("Z2JZ"), true);
  assert.equal(isServiceCode("1680"), false);
  assert.equal(isServiceCode(null), null);
});

test("set-aside detection", () => {
  assert.equal(isSmallBusinessSetAside({ setAside: "Total Small Business Set-Aside (FAR 19.5)", setAsideCode: "SBA" }), true);
  assert.equal(isSmallBusinessSetAside({ setAside: null, setAsideCode: "WOSB" }), true);
  assert.equal(isSmallBusinessSetAside({ setAside: null, setAsideCode: null }), false);
  assert.equal(isSmallBusinessSetAside({ setAside: "None", setAsideCode: "NONE" }), false);
});

test("biddable notice types", () => {
  assert.equal(isBiddable("Combined Synopsis/Solicitation"), true);
  assert.equal(isBiddable("Solicitation"), true);
  assert.equal(isBiddable("Sources Sought"), false);
  assert.equal(isBiddable("Award Notice"), false);
});

test("a simple small-business service bid is a strong fit", () => {
  const f = fitScore(byId["DEMO-0001"]!, now);
  assert.equal(f.verdict, "Strong fit");
  assert.equal(f.score, 100);
});

test("a product buy with a big package is a hard pass", () => {
  const f = fitScore(byId["DEMO-0009"]!, now);
  assert.equal(f.verdict, "Hard pass");
  assert.equal(f.criteria.find((c) => c.key === "service")!.level, "bad");
  assert.equal(f.criteria.find((c) => c.key === "simple")!.level, "bad");
});

test("deadline pressure lowers the score", () => {
  const o = { ...byId["DEMO-0001"]!, responseDeadline: addDays(now, 2).toISOString() };
  const f = fitScore(o, now);
  assert.equal(f.criteria.find((c) => c.key === "time")!.level, "bad");
  assert.ok(f.score < 100);
  const closed = fitScore({ ...o, responseDeadline: addDays(now, -1).toISOString() }, now);
  assert.equal(closed.criteria.find((c) => c.key === "time")!.label, "Deadline passed");
});

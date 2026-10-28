import assert from "node:assert/strict";
import { test } from "node:test";
import { isResidential, isTradeWork, tagTrades, workForJob } from "./permit-trades.ts";

const trades = (type: string, desc: string, res: boolean | null = true) => tagTrades(type, desc, res).map((t) => t.trade).sort();

test("new homes tag the follow-on trades", () => {
  const expected = ["blinds", "cleaning", "fence", "gutters", "landscaping", "patio", "pool"];
  assert.deepEqual(trades("New · Single Family/Duplex", "Construct new single family residence with attached garage"), expected);
  assert.deepEqual(trades("Bldg-New · 1 or 2 Family Dwelling", "New 2-story SFD with attached garage and deck"), [...expected, "painting"].sort(), "a deck doesn't hide the new home");
  assert.deepEqual(trades("Permit - New Construction", "ERECT 2 STORY SINGLE FAMILY RESIDENCE WITH DETACHED GARAGE"), expected);
  assert.deepEqual(trades("Building Permit · New", "Single family residence"), expected, "work class in the type");
});

test("new commercial buildings get commercial trades", () => {
  assert.deepEqual(trades("Bldg-New · Commercial", "New 3-story office building", false), ["blinds", "cleaning", "landscaping"]);
});

test("pools, demolition, roofs and remodels", () => {
  assert.deepEqual(trades("Building Permit · Pool", "New in-ground pool and spa"), ["fence", "landscaping", "patio"]);
  assert.deepEqual(trades("Demolition", "Demolish existing one family dwelling"), ["fence", "junk", "landscaping"]);
  assert.deepEqual(trades("Bldg-Alter/Repair · 1 or 2 Family Dwelling", "Re-roof with Class A roof covering"), ["gutters", "solar"]);
  assert.deepEqual(trades("Addition To Structure", "Room addition, 400 sq ft"), ["blinds", "cleaning", "painting", "roofing", "windows"]);
  assert.deepEqual(trades("Deck · Construct", "New Deck - building a freestanding deck"), ["landscaping", "painting"]);
  assert.deepEqual(trades("Commercial · Tenant Improvement", "Interior build-out for retail", false), ["cleaning", "painting"]);
});

test("an electrical permit for a new pool isn't a new home or a pool builder's job", () => {
  assert.deepEqual(trades("Electrical Permit · New", "New construction in-ground pool and spa."), []);
  assert.deepEqual(trades("Building Permit · New", "New construction in-ground pool and spa"), ["fence", "landscaping", "patio"]);
  assert.equal(isTradeWork("pool", "Electrical Permit · New", "New construction in-ground pool and spa"), false);
  assert.equal(isTradeWork("solar", "Electrical Permit", "Roof mounted PV system"), true);
});

test("roof-mounted solar isn't a new roof", () => {
  assert.deepEqual(trades("Residential Solar/PV Permit", "Installation of roof mounted PV solar panels / 22 modules"), []);
});

test("isTradeWork spots a trade's own permits", () => {
  assert.equal(isTradeWork("pool", "Building Permit · Pool", "New in-ground pool"), true);
  assert.equal(isTradeWork("fence", "Fence Permit", "8 ft wood fence"), true);
  assert.equal(isTradeWork("solar", "Residential Solar/PV Permit", ""), true);
  assert.equal(isTradeWork("fence", "Building Permit · New", "New single family residence"), false);
  assert.equal(isTradeWork("pool", "Building Permit · New", "New single family home with pool and spa"), false, "that's a home builder");
  assert.equal(isTradeWork("cleaning", "Building", "anything"), false, "no permit is cleaning work");
});

test("trade-only permits aren't leads", () => {
  assert.deepEqual(trades("Electrical Permit · Service", "Replace 200A panel"), []);
  assert.deepEqual(trades("Sign", "Install illuminated wall sign"), []);
  assert.deepEqual(trades("Residential Mechanical Permit", "(2) 100K BTU furnace changeouts"), []);
  assert.deepEqual(trades("Plumbing Permit", "Replace water heater"), []);
  assert.deepEqual(trades("Plumbing Permit · Addition and Remodel", "Full-house renovation including new kitchen"), [], "the building permit is the lead");
  assert.deepEqual(trades("Building · Alteration/Repair · Commercial", "Renovate existing square footage", false), ["cleaning", "painting"]);
});

test("residential-only rules skip commercial permits", () => {
  assert.deepEqual(trades("Addition", "Office addition", false), []);
});

test("every tag explains itself and says how sure it is", () => {
  for (const t of tagTrades("New · Single Family/Duplex", "new house", true)) {
    assert.ok(t.reason.length > 10);
    assert.ok(["strong", "likely", "possible"].includes(t.strength));
  }
  const pool = Object.fromEntries(tagTrades("Building Permit · Pool", "New in-ground pool", true).map((t) => [t.trade, t.strength]));
  assert.deepEqual(pool, { fence: "strong", patio: "strong", landscaping: "likely" });
});

test("trade permits name HVAC, electrical and plumbing contractors", () => {
  assert.equal(isTradeWork("hvac", "Mechanical Permit · Remodel", "Replace furnace"), true);
  assert.equal(isTradeWork("electrical", "Electrical permit · New Job Filing", "Rewire"), true);
  assert.equal(isTradeWork("plumbing", "Plumbing Permit", "Water heater"), true);
  assert.equal(isTradeWork("hvac", "Plumbing Permit", "Water heater"), false);
  assert.equal(isTradeWork("general", "Building Permit · New", "New single family residence"), true, "home builders are general contractors");
  assert.equal(isTradeWork("general", "Electrical Permit", "New service"), false);
});

test("workForJob maps a government job to the subs it needs", () => {
  assert.deepEqual(workForJob({ naicsCode: "561730", title: "Grounds Maintenance Services" }), ["landscaping"]);
  assert.deepEqual(workForJob({ naicsCode: "238220", title: "HVAC Preventive Maintenance" }), ["hvac", "plumbing"]);
  assert.deepEqual(workForJob({ naicsCode: "236220", title: "Renovate Building 12 restrooms" }), ["general"]);
  assert.deepEqual(workForJob({ naicsCode: null, title: "Replace chain link fencing", terms: ["fence contractor"] }), ["fence"]);
  assert.deepEqual(workForJob({ naicsCode: "561720", title: "Janitorial Services" }), [], "permits don't help with janitorial");
});

test("isResidential", () => {
  assert.equal(isResidential("Single Family/Duplex"), true);
  assert.equal(isResidential("Commercial"), false);
  assert.equal(isResidential("R"), true);
  assert.equal(isResidential("C"), false);
  assert.equal(isResidential(""), null);
  assert.equal(isResidential("Electrical"), null);
});

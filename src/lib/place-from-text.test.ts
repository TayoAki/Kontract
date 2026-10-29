import assert from "node:assert/strict";
import { test } from "node:test";
import { workPlaceFromText } from "./place-from-text.ts";

test("the site's address from the notice text, not where to send quotes", () => {
  const va = "The VA Bedford Healthcare System, 200 Springs Road, Bedford, MA 01730 is seeking vendors that can provide Window Cleaning Services. Quotes shall be emailed to the Contracting Office, Togus, ME 04330.";
  assert.deepEqual(workPlaceFromText(va), { city: "Bedford", state: "MA", zip: "01730" });
  assert.equal(workPlaceFromText("Submit quotes to Network Contracting Office 1, Togus, ME 04330."), null);
  assert.deepEqual(workPlaceFromText("Work will be performed at Fort Cavazos, TX 76544-5000."), { city: "Fort Cavazos", state: "TX", zip: "76544" });
  assert.equal(workPlaceFromText("No address here."), null);
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyStripeSignature } from "./stripe-signature.ts";

const secret = "whsec_test";
const body = '{"type":"checkout.session.completed"}';
const sign = (t: number, s = secret) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${body}`).digest("hex")}`;

test("accepts a fresh, correctly signed payload", () => {
  assert.equal(verifyStripeSignature(body, sign(1000), secret, 1100), true);
});

test("rejects wrong secrets, tampered bodies, stale timestamps and missing headers", () => {
  assert.equal(verifyStripeSignature(body, sign(1000, "whsec_other"), secret, 1100), false);
  assert.equal(verifyStripeSignature(body + " ", sign(1000), secret, 1100), false);
  assert.equal(verifyStripeSignature(body, sign(1000), secret, 2000), false, "older than 5 minutes");
  assert.equal(verifyStripeSignature(body, null, secret), false);
  assert.equal(verifyStripeSignature(body, "garbage", secret), false);
});

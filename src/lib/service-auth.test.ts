import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeService, serviceKeys, withService } from "./service-auth.ts";

const K1 = "a".repeat(64);
const K2 = "0123456789abcdef".repeat(4);
const keys = serviceKeys(`${K1}, ${K2}`);
const req = (headers: Record<string, string>) => new Request("http://x/api/v1/opportunities", { headers });

test("no key is refused", () => {
  assert.equal(authorizeService(req({ "X-Workspace-Id": "magpie-acme" }), keys), null);
  assert.equal(authorizeService(req({ Authorization: "Bearer", "X-Workspace-Id": "magpie-acme" }), keys), null);
});

test("a wrong key is refused", () => {
  assert.equal(authorizeService(req({ Authorization: `Bearer ${"b".repeat(64)}`, "X-Workspace-Id": "magpie-acme" }), keys), null);
  assert.equal(authorizeService(req({ Authorization: `Basic ${K1}`, "X-Workspace-Id": "magpie-acme" }), keys), null);
  assert.equal(authorizeService(req({ Authorization: `Bearer ${K1}x`, "X-Workspace-Id": "magpie-acme" }), keys), null);
});

test("every key in the list is accepted, and the workspace comes through", () => {
  for (const k of [K1, K2]) assert.deepEqual(authorizeService(req({ Authorization: `Bearer ${k}`, "X-Workspace-Id": "magpie-acme" }), keys), { workspaceId: "magpie-acme" });
});

test("a missing or malformed X-Workspace-Id is refused", () => {
  const auth = { Authorization: `Bearer ${K1}` };
  assert.equal(authorizeService(req(auth), keys), null);
  for (const bad of ["", "Magpie-Acme", "magpie_acme", "magpie acme", "x".repeat(65), "../etc"]) {
    assert.equal(authorizeService(req({ ...auth, "X-Workspace-Id": bad }), keys), null, bad);
  }
  // Only the usage route lets it be left out.
  assert.deepEqual(authorizeService(req(auth), keys, false), { workspaceId: "" });
});

test("short keys and an empty list accept nothing", () => {
  assert.equal(serviceKeys("short-key, ").length, 0);
  assert.equal(serviceKeys(undefined).length, 0);
  assert.equal(authorizeService(req({ Authorization: "Bearer short-key", "X-Workspace-Id": "w" }), serviceKeys("short-key")), null);
});

test("withService answers one generic 401 and never runs the handler", async () => {
  process.env.KONTRACT_SERVICE_KEYS = K1;
  let ran = false;
  const handler = withService("/api/v1/test", () => {
    ran = true;
    return new Response("ok");
  });
  const attempts: Record<string, string>[] = [{}, { Authorization: `Bearer ${K2}`, "X-Workspace-Id": "w" }, { Authorization: `Bearer ${K1}` }];
  for (const headers of attempts) {
    const res = await handler(req(headers));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Unauthorized." });
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
  assert.equal(ran, false);
  delete process.env.KONTRACT_SERVICE_KEYS;
});

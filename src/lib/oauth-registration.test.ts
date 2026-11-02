import assert from "node:assert/strict";
import { test } from "node:test";
import { withNativeLoopbackDefault } from "./oauth-registration.ts";

test("loopback-only clients that don't say are labelled native", () => {
  for (const uri of ["http://localhost:8976/callback", "http://127.0.0.1:33418/", "http://[::1]:9000/cb"]) {
    assert.deepEqual(withNativeLoopbackDefault({ redirect_uris: [uri] }), { redirect_uris: [uri], application_type: "native" });
  }
});

test("everything else is left alone", () => {
  const web = { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] };
  assert.equal(withNativeLoopbackDefault(web), web);
  const mixed = { redirect_uris: ["http://localhost:1/cb", "https://example.com/cb"] };
  assert.equal(withNativeLoopbackDefault(mixed), mixed);
  const said = { application_type: "web", redirect_uris: ["http://localhost:1/cb"] };
  assert.equal(withNativeLoopbackDefault(said), said);
  assert.equal((withNativeLoopbackDefault({ redirect_uris: ["http://localhost.evil.com/cb"] }) as { application_type?: string }).application_type, undefined);
  assert.equal(withNativeLoopbackDefault(null), null);
});

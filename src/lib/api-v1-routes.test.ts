import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generate, OUT } from "../../scripts/api-v1-types.ts";

const V1 = fileURLToPath(new URL("../app/api/v1", import.meta.url));

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === "route.ts" ? [p] : [];
  });
}

const files = routes(V1).map((path) => ({ path: path.slice(V1.length), src: readFileSync(path, "utf8") }));

test("every engine API handler is wrapped in withService (health is the one exception)", () => {
  assert.ok(files.length >= 13, `found ${files.length} routes`);
  for (const { path, src } of files) {
    const handlers = [...src.matchAll(/export\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b(.*)/g)];
    assert.ok(handlers.length > 0, `${path} exports no handler`);
    for (const [, method, rest] of handlers) {
      if (path === "/health/route.ts") continue;
      assert.match(rest!, /^\s*=\s*withService\(/, `${path} ${method} isn't wrapped in withService`);
    }
  }
});

test("engine API routes never use a session or a user's records", () => {
  for (const { path, src } of files) {
    assert.doesNotMatch(src, /withUser|requireUser|getSession|listDeals|getDeal|saveDeal|getProfile|listContacts|saveContact|app_record/, path);
  }
});

test("src/lib/api-v1.ts matches the source types (regenerate with scripts/api-v1-types.ts)", () => {
  assert.equal(readFileSync(OUT, "utf8"), generate());
});

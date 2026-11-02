import { fail, json } from "@/lib/http";
import { withService } from "@/lib/service-auth";
import { usageFor } from "@/lib/service-usage";

export const dynamic = "force-dynamic";

/** Calls and spend for one workspace in one month: ?workspace=magpie-acme&month=2026-11. */
export const GET = withService(
  "/api/v1/usage",
  async (req) => {
    const p = new URL(req.url).searchParams;
    const workspace = p.get("workspace") ?? "";
    const month = p.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^[a-z0-9-]{1,64}$/.test(workspace)) return fail("Give a workspace.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Give the month as YYYY-MM.");
    return json(usageFor(workspace, month));
  },
  { workspace: "optional" },
);

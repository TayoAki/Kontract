import { json, withUser } from "@/lib/http";
import { checkAllFeeds, permitRegister } from "@/lib/permits";
import { refreshSled } from "@/lib/sled";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

let running: Promise<void> | null = null;

/** Re-pull every feed now and return the register with fresh health. */
export const POST = withUser(async () => {
  running ??= Promise.all([checkAllFeeds(), refreshSled()]).then(() => undefined).finally(() => {
    running = null;
  });
  await running;
  return json({ feeds: permitRegister() });
});

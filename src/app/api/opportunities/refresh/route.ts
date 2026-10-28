import { json, withUser } from "@/lib/http";
import { refreshSamData } from "@/lib/sam-bulk";

/** Check SAM.gov for a newer daily file now; downloads only if it changed. */
export const POST = withUser(async () => {
  return json({ samData: await refreshSamData() });
});

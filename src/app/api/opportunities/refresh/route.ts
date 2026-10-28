import { json } from "@/lib/http";
import { refreshSamData } from "@/lib/sam-bulk";

/** Check SAM.gov for a newer daily file now; downloads only if it changed. */
export async function POST() {
  return json({ samData: await refreshSamData() });
}

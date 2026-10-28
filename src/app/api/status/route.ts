import { hasClaude, MODEL } from "@/lib/claude";
import { json, withUser } from "@/lib/http";
import { placesProvider } from "@/lib/places";
import { planConfig } from "@/lib/plans";
import { hasSamKey } from "@/lib/sam";
import { samDataStatus } from "@/lib/sam-bulk";
import { sledStatus } from "@/lib/sled";
import type { IntegrationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  const status: IntegrationStatus = {
    sam: hasSamKey(),
    firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
    samData: await samDataStatus(),
    claude: hasClaude(),
    places: placesProvider(),
    usaspending: true,
    model: MODEL,
    subPlans: planConfig(),
    sled: sledStatus(),
  };
  return json(status);
});

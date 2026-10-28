import { hasClaude, MODEL } from "@/lib/claude";
import { json, withUser } from "@/lib/http";
import { placesProvider } from "@/lib/places";
import { hasSamKey } from "@/lib/sam";
import { samDataStatus } from "@/lib/sam-bulk";
import type { IntegrationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withUser(async () => {
  const status: IntegrationStatus = {
    sam: hasSamKey(),
    samData: await samDataStatus(),
    claude: hasClaude(),
    places: placesProvider(),
    usaspending: true,
    model: MODEL,
  };
  return json(status);
});

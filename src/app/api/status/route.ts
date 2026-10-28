import { hasClaude, MODEL } from "@/lib/claude";
import { json } from "@/lib/http";
import { placesProvider } from "@/lib/places";
import { hasSamKey } from "@/lib/sam";
import type { IntegrationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  const status: IntegrationStatus = {
    sam: hasSamKey(),
    claude: hasClaude(),
    places: placesProvider(),
    usaspending: true,
    model: MODEL,
  };
  return json(status);
}

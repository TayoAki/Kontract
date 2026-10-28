import "server-only";
import { addDays, toSamDate } from "./format";
import { cached } from "./store";

// SAM.gov "Get Opportunities" public API v2, used only for what the daily
// file lacks: a notice's attachment links. Search runs on the daily file
// (see sam-bulk.ts), so this costs one request per notice you open.
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/

const SEARCH_URL = "https://api.sam.gov/opportunities/v2/search";
const ATTACHMENTS_TTL = 7 * 24 * 60 * 60 * 1000;

export const hasSamKey = () => Boolean(process.env.SAM_API_KEY);

export class SamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function samErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) return "SAM.gov rejected the API key. Check SAM_API_KEY (keys expire every 90 days).";
  if (status === 429) return "SAM.gov's daily request limit was reached. Try again tomorrow, or use a key with a role (1,000 requests/day).";
  const detail = body.match(/"(?:errorMessage|message|error)"\s*:\s*"([^"]+)"/)?.[1];
  return `SAM.gov error ${status}${detail ? `: ${detail}` : ""}`;
}

/** Attachment download links for one notice. The API requires a posted-date window, so we search ±1 day around it. */
export async function fetchAttachments(noticeId: string, postedDate: string): Promise<string[]> {
  if (!hasSamKey()) throw new SamError("Add SAM_API_KEY to list attachments here.", 400);
  const posted = new Date(postedDate);
  if (Number.isNaN(posted.getTime())) throw new SamError("Unknown posted date for this notice.", 400);
  return cached(`sam:attachments:${noticeId}`, ATTACHMENTS_TTL, async () => {
    const params = new URLSearchParams({
      noticeid: noticeId,
      postedFrom: toSamDate(addDays(posted, -1)),
      postedTo: toSamDate(addDays(posted, 1)),
      limit: "1",
      api_key: process.env.SAM_API_KEY!,
    });
    const res = await fetch(`${SEARCH_URL}?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new SamError(samErrorMessage(res.status, await res.text()), res.status);
    const body = (await res.json()) as { opportunitiesData?: { resourceLinks?: string[] | null }[] };
    return body.opportunitiesData?.[0]?.resourceLinks ?? [];
  });
}

import "server-only";

// Firecrawl renders a page (JavaScript included) and returns it as Markdown
// plus its links. Used to read subcontractors' websites and state/local bid
// pages. 1 credit per page. FIRECRAWL_API_KEY; https://firecrawl.dev

const API = "https://api.firecrawl.dev/v2/scrape";

export const hasFirecrawl = () => Boolean(process.env.FIRECRAWL_API_KEY);

export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export interface Scraped {
  markdown: string;
  links: string[];
  url: string;
  title: string;
  statusCode: number | null;
}

export interface ScrapeOptions {
  /** Keep headers and footers (where contact details live). */
  fullPage?: boolean;
  /** Accept Firecrawl's cached copy up to this old. */
  maxAgeMs?: number;
  timeoutMs?: number;
  /** Let JavaScript-heavy pages (Salesforce portals) render first. */
  waitForMs?: number;
}

export async function scrape(url: string, opts: ScrapeOptions = {}): Promise<Scraped> {
  if (!hasFirecrawl()) throw new FirecrawlError("Add FIRECRAWL_API_KEY to read websites.", 400);
  const body = {
    url,
    formats: ["markdown", "links"],
    onlyMainContent: !opts.fullPage,
    maxAge: opts.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000,
    timeout: opts.timeoutMs ?? 45_000,
    blockAds: true,
    ...(opts.waitForMs ? { waitFor: opts.waitForMs } : {}),
  };
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout((opts.timeoutMs ?? 45_000) + 15_000),
    });
  } catch (err) {
    throw new FirecrawlError((err as Error).name === "TimeoutError" ? "The page took too long to load." : "Couldn't reach Firecrawl.", 504);
  }
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: { markdown?: string; links?: string[]; metadata?: { url?: string; sourceURL?: string; title?: string | string[]; statusCode?: number; error?: string | null } };
  };
  if (!res.ok || json.success === false) {
    if (res.status === 401 || res.status === 403) throw new FirecrawlError("Firecrawl rejected the API key. Check FIRECRAWL_API_KEY.", 401);
    if (res.status === 402) throw new FirecrawlError("The Firecrawl account is out of credits.", 402);
    if (res.status === 429) throw new FirecrawlError("Firecrawl is rate limiting; try again in a minute.", 429);
    throw new FirecrawlError(json.error ? `Couldn't read the page: ${json.error}` : `Firecrawl error ${res.status}`, 502);
  }
  const m = json.data?.metadata ?? {};
  if (m.statusCode && m.statusCode >= 400) throw new FirecrawlError(`The site answered ${m.statusCode}.`, 502);
  return {
    markdown: json.data?.markdown ?? "",
    links: json.data?.links ?? [],
    url: m.url ?? m.sourceURL ?? url,
    title: Array.isArray(m.title) ? (m.title[0] ?? "") : (m.title ?? ""),
    statusCode: m.statusCode ?? null,
  };
}

import "server-only";
import { FirecrawlError, scrape } from "./firecrawl";
import { normalizeWebsite } from "./prospect-rules";
import { contactPage, siteFacts, type SiteFacts } from "./site-facts";
import { cached } from "./store";

// Reads a subcontractor's website with Firecrawl: the home page, plus the
// contact page when the home page has no email or phone. At most 2 credits a
// site, and each site is read once a month.

const TTL = 30 * 24 * 60 * 60 * 1000;

export async function readSubWebsite(raw: string): Promise<SiteFacts> {
  const url = normalizeWebsite(raw);
  if (!url) throw new FirecrawlError("That doesn't look like a website address.", 400);
  const host = new URL(url).hostname.replace(/^www\./, "");
  return cached(`site:${host}`, TTL, async () => {
    const home = await scrape(url, { fullPage: true });
    const pages = [{ url: home.url, markdown: home.markdown, links: home.links }];
    const first = siteFacts(url, pages);
    const contact = !first.emails.length || !first.phones.length ? contactPage(home.url, home.links) : null;
    if (contact) {
      try {
        const page = await scrape(new URL(contact, home.url).href, { fullPage: true });
        pages.push({ url: page.url, markdown: page.markdown, links: page.links });
      } catch {
        // The home page alone is still worth returning.
      }
    }
    return siteFacts(url, pages);
  });
}

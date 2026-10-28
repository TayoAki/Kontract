import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ClaudeError, fallback, getClient, hasClaude, MODEL } from "./claude";
import { uid } from "./format";
import { permitMarket } from "./permit-sources";
import { tradeById } from "./permit-trades";
import { cleanProspects, sampleProspects } from "./prospect-rules";
import { listProspects, saveProspect, saveRun } from "./store";
import type { Account, BusinessProfile, Prospect, ProspectRun } from "./types";

// The AI customer finder. Step 1: Claude reads the sub's website and searches
// the web for companies with a recent reason to hire them (funding, hiring,
// LinkedIn and X posts, community threads, news), citing a page for each.
// Step 2: a second call turns that research into structured prospects with a
// first email each. Nothing is sent: the sub reviews and sends every email.

export type ProspectEvent =
  | { type: "step"; text: string }
  | { type: "search"; query: string }
  | { type: "fetch"; url: string }
  | { type: "profile"; profile: BusinessProfile }
  | { type: "prospects"; prospects: Prospect[] }
  | { type: "error"; message: string }
  | { type: "done"; run: ProspectRun };

const RESEARCH_SYSTEM = `You research sales prospects for small local service businesses, often subcontractors (landscapers, cleaners, fence and roofing companies, electricians, IT and office services).

Find companies likely to buy from this business in the next 60 days because of something that happened recently and publicly. Read the business's website first so you know what they sell and to whom.

Rules:
- Every prospect needs a source: the URL of the page that shows the signal. Only report what a page says; leave out anything you can't verify.
- Prefer signals from the last 60 days, and companies in or near the business's service area.
- People: give a name and title only if a page you read names them. Give an email only if it is printed on a page you read. Never build or guess an email address.
- LinkedIn and X: use posts that search surfaces publicly. Don't claim to have seen anything you didn't.
- Don't include individuals' private details (home addresses, personal phones).`;

function researchPrompt(website: string, a: Account, kinds: string[]): string {
  const market = permitMarket(a.market);
  const area = market ? `${market.name.replace(/\s*\(.*\)$/, "")}, ${market.state}` : "their area (see the website)";
  const trade = a.trade ? tradeById(a.trade).label : "see the website";
  return `Business website: ${website}
Business name: ${a.company || "(see the website)"}
Trade: ${trade}
Service area: ${area}

1. Fetch ${website} (and its services or about page if linked) and work out: what they sell, who their customers are, their service area, and which events make a company need them now.
2. Search for companies showing these signals: ${kinds.join("; ")}.
3. Write a research memo with two sections.

## Business profile
Summary, services, ideal customers, service area, buying signals.

## Prospects
Up to 12 companies, best first. For each: company name, website, signal type (funding, hiring, linkedin, x, community or news), what happened and when, the source URL, why they'd need this business now, location, funding amount, round and date if it's a raise, roles they're hiring for if hiring, and people (name, title, LinkedIn URL, and an email only if printed on a page you read).`;
}

const SIGNAL_QUERIES: Record<string, string> = {
  funding: "companies that recently raised funding (seed, Series A/B) and are opening or expanding offices in the service area",
  hiring: "companies hiring several roles in the service area, especially office, facilities, or operations roles",
  linkedin: "LinkedIn posts from local companies announcing a new office, move, expansion, or a need this business fills",
  x: "posts on X from local companies or founders announcing moves, openings, or asking for recommendations this business fits",
  community: "community threads (Reddit, local forums, Nextdoor-style groups) where businesses ask for this kind of service",
  news: "local business news: new locations, construction, relocations, openings",
};

const ResultSchema = z.object({
  profile: z.object({
    summary: z.string(),
    services: z.array(z.string()),
    idealCustomers: z.array(z.string()),
    serviceArea: z.string(),
    buyingSignals: z.array(z.string()),
  }),
  prospects: z.array(
    z.object({
      company: z.string(),
      website: z.string().nullable(),
      kind: z.enum(["funding", "hiring", "linkedin", "x", "community", "news"]),
      signal: z.string().describe("What happened, in one sentence"),
      signalUrl: z.string().describe("The source page from the research"),
      signalDate: z.string().nullable().describe("YYYY-MM-DD or YYYY-MM if known"),
      whyFit: z.string(),
      location: z.string().nullable(),
      fundingAmount: z.string().nullable(),
      fundingRound: z.string().nullable(),
      fundingDate: z.string().nullable(),
      hiring: z.array(z.string()),
      people: z.array(z.object({ name: z.string(), title: z.string().nullable(), linkedin: z.string().nullable(), email: z.string().nullable() })),
      outreachSubject: z.string(),
      outreachBody: z.string().describe("A short first email from the business, about this signal. [placeholders] for anything unknown, signed [your name]."),
    }),
  ),
});

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

/** Text of every page web_fetch read: the only place an email may come from. */
const fetchedText = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .flatMap((b) => (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result" && b.content.content.source.type === "text" ? [b.content.content.source.data] : []))
    .join("\n");

/** Run the finder, yielding progress as it goes. Saves new prospects and the run. */
export async function* findProspects(userId: string, account: Account, website: string, kinds: string[], signal?: AbortSignal): AsyncGenerator<ProspectEvent> {
  const run: ProspectRun = { id: uid("run"), website, startedAt: new Date().toISOString(), found: 0, searches: 0 };
  await saveRun(userId, run);
  const existing = await listProspects(userId);

  if (!hasClaude()) {
    const sample = sampleProspects(website);
    yield { type: "step", text: "Claude isn't configured, so these are labeled samples. Add ANTHROPIC_API_KEY to find real prospects." };
    yield { type: "profile", profile: sample.profile };
    for (const p of sample.prospects) await saveProspect(userId, p);
    yield { type: "prospects", prospects: sample.prospects };
    const done = { ...run, finishedAt: new Date().toISOString(), profile: sample.profile, found: sample.prospects.length, sample: true };
    await saveRun(userId, done);
    yield { type: "done", run: done };
    return;
  }

  const client = getClient();
  const wanted = kinds.length ? kinds : Object.keys(SIGNAL_QUERIES);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: researchPrompt(website, account, wanted.map((k) => SIGNAL_QUERIES[k] ?? k)) }];
  const market = permitMarket(account.market);
  let research = "";
  let pages = "";
  try {
    yield { type: "step", text: `Reading ${new URL(website).hostname} and searching for buying signals…` };
    // Long server-tool turns can pause; send them back to continue (a few times at most).
    for (let turn = 0; turn < 5; turn++) {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 32000,
          ...fallback(),
          output_config: { effort: "medium" },
          system: RESEARCH_SYSTEM,
          tools: [
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: 10,
              ...(market ? { user_location: { type: "approximate" as const, city: market.name.replace(/\s*\(.*\)$/, ""), region: market.state, country: "US" } } : {}),
            },
          ],
          messages,
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type !== "content_block_stop") continue;
        const block = stream.currentMessage?.content[event.index];
        if (block?.type !== "server_tool_use") continue;
        const input = block.input as { query?: string; url?: string };
        if (block.name === "web_search" && input.query) {
          run.searches += 1;
          yield { type: "search", query: input.query };
        } else if (block.name === "web_fetch" && input.url) {
          yield { type: "fetch", url: input.url };
        }
      }
      const message = await stream.finalMessage();
      research += `\n${textOf(message.content)}`;
      pages += `\n${fetchedText(message.content)}`;
      if (message.stop_reason === "refusal") throw new ClaudeError("Claude declined this search.", 422);
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }
    if (!research.trim()) throw new ClaudeError("The search came back empty. Try again.", 502);

    yield { type: "step", text: "Sorting the prospects and drafting a first email for each…" };
    const parsed = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        ...fallback(),
        output_config: { effort: "low", format: betaZodOutputFormat(ResultSchema) },
        system: "Turn research notes into structured prospects. Use only what the notes say; drop any prospect without a source URL. Emails: copy only addresses that appear in the notes.",
        messages: [{ role: "user", content: `Business: ${account.company || website}\n\nResearch notes:\n${research}` }],
      },
      { signal },
    );
    if (parsed.stop_reason === "refusal") throw new ClaudeError("Claude declined to summarize this search.", 422);
    const out = parsed.parsed_output;
    if (!out) throw new ClaudeError("The results came back incomplete. Try again.", 502);
    yield { type: "profile", profile: out.profile };
    const prospects = cleanProspects(out.prospects, pages, existing);
    for (const p of prospects) await saveProspect(userId, p);
    yield { type: "prospects", prospects };
    const done = { ...run, finishedAt: new Date().toISOString(), profile: out.profile, found: prospects.length };
    await saveRun(userId, done);
    yield { type: "done", run: done };
  } catch (err) {
    await saveRun(userId, { ...run, finishedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

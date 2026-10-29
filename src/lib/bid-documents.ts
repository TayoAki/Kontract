import "server-only";
import { createHash } from "node:crypto";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { extractBidDetails, type ReadDoc } from "./bid-details";
import { buildCorpus, cleanPageMarkdown, documentLinks, orderDocs, verifyReading } from "./bid-reading";
import { ClaudeError, fallback, getClient, hasClaude, MODEL } from "./claude";
import { docText, DocTextError, extOf, readable } from "./doc-text";
import { hasFirecrawl, scrape } from "./firecrawl";
import { fetchAttachments, hasSamKey } from "./sam";
import { cached } from "./store";
import type { BidDetails, BidDocument, Opportunity } from "./types";

// Reads a notice's attachments. SAM.gov lists and serves public attachments
// without an API key (the same endpoints its website uses), so this doesn't
// spend the ~10/day SAM_API_KEY allowance; the key is only a fallback for
// the list. Files are read on this server and never stored; the facts are
// cached per notice and attachment set, so an amendment triggers a re-read.

const RESOURCES = (id: string) => `https://sam.gov/api/prod/opps/v3/opportunities/${encodeURIComponent(id)}/resources`;
const DOWNLOAD = (resourceId: string) => `https://sam.gov/api/prod/opps/v3/opportunities/resources/files/${encodeURIComponent(resourceId)}/download`;
const MAX_FILE = 45 * 1024 * 1024;
const DETAILS_TTL = 30 * 24 * 60 * 60 * 1000;
const LIST_TTL = 60 * 60 * 1000;

export class BidReadError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

interface SamAttachment {
  resourceId?: string;
  name?: string;
  size?: number;
  postedDate?: string;
  accessLevel?: string;
  type?: string;
  uri?: string;
  deletedFlag?: string;
}

interface Portal {
  documents: BidDocument[];
  page: ReadDoc | null;
}

/** State and local bids: the portal's bid page (rendered by Firecrawl) and any public documents it links. */
async function portal(o: Opportunity): Promise<Portal> {
  if (o.source !== "sled" || !hasFirecrawl() || !/^https?:\/\//.test(o.samUrl)) return { documents: [], page: null };
  try {
    return await cached(`portal:${o.id}`, 6 * 60 * 60 * 1000, async () => {
      const p = await scrape(o.samUrl, { waitForMs: 6000 });
      const text = cleanPageMarkdown(p.markdown);
      return {
        documents: documentLinks(p.links, p.url).map((d): BidDocument => ({ id: d.url, name: d.name, url: d.url, size: null, postedDate: null, read: "skipped" })),
        page: text ? { name: `${o.portal ?? "Bid"} page`, text } : null,
      };
    });
  } catch (err) {
    console.error("portal read failed", o.samUrl, (err as Error).message);
    return { documents: [], page: null };
  }
}

/** The notice's attachments, newest posting first. */
export async function listAttachments(o: Opportunity): Promise<BidDocument[]> {
  if (o.isSample) return [];
  if (o.source === "sled") return (await portal(o)).documents;
  return cached(`sam:resources:${o.id}`, LIST_TTL, async () => {
    try {
      const res = await fetch(RESOURCES(o.id), { headers: { Accept: "application/hal+json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`SAM.gov answered ${res.status}`);
      const body = (await res.json()) as { _embedded?: { opportunityAttachmentList?: { attachments?: SamAttachment[] }[] } };
      const list = (body._embedded?.opportunityAttachmentList ?? []).flatMap((l) => l.attachments ?? []);
      return list
        .filter((a) => a.resourceId && a.deletedFlag !== "1")
        .map((a): BidDocument => {
          const link = a.type === "link" && a.uri ? a.uri : null;
          return {
            id: a.resourceId!,
            name: a.name || (link ? link : "Attachment"),
            url: link ?? DOWNLOAD(a.resourceId!),
            size: typeof a.size === "number" ? a.size : null,
            postedDate: a.postedDate ?? null,
            read: "skipped",
            note: link ? "A link to another site" : a.accessLevel && a.accessLevel !== "public" ? "Controlled: sign in to SAM.gov to download" : undefined,
          };
        })
        .sort((a, b) => (b.postedDate ?? "").localeCompare(a.postedDate ?? ""));
    } catch (err) {
      if (!hasSamKey()) throw new BidReadError(`Couldn't list the attachments on SAM.gov (${(err as Error).message}). Try again in a minute.`);
      const links = await fetchAttachments(o.id, o.postedDate);
      return links.map((url, i) => ({ id: url, name: `Attachment ${i + 1}`, url, size: null, postedDate: null, read: "skipped" as const }));
    }
  });
}

function fingerprint(o: Opportunity, docs: BidDocument[]): string {
  const h = createHash("sha1");
  h.update(`${o.description?.length ?? 0}|${o.versions ?? 1}`);
  for (const d of docs) h.update(`|${d.id}:${d.postedDate ?? ""}`);
  return h.digest("hex").slice(0, 16);
}

async function download(d: BidDocument): Promise<Uint8Array> {
  const res = await fetch(d.url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new DocTextError(`Download failed (${res.status})`);
  const len = Number(res.headers.get("content-length"));
  if (len > MAX_FILE) throw new DocTextError("Too large to read here");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE) throw new DocTextError("Too large to read here");
  return bytes;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

/** Download and read each attachment, a few at a time. */
async function readAll(list: BidDocument[]): Promise<{ documents: BidDocument[]; texts: ReadDoc[] }> {
  const texts: ReadDoc[] = [];
  const documents = list.map((d) => ({ ...d }));
  const queue = documents.filter((d) => {
    if (d.note) return false;
    if (!readable(d.name)) {
      d.note = extOf(d.name) ? `.${extOf(d.name)} files can't be read here` : "Unknown file type";
      return false;
    }
    if (d.size && d.size > MAX_FILE) {
      d.note = `Too large to read here (${mb(d.size)})`;
      return false;
    }
    return true;
  });
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        try {
          const doc = await docText(d.name, await download(d));
          d.read = doc.scanned ? "scanned" : "read";
          d.pages = doc.pages;
          d.chars = doc.text.length;
          if (doc.scanned) d.note = "A scan with no text layer";
          else texts.push({ name: d.name, text: doc.text });
        } catch (err) {
          d.read = "failed";
          d.note = err instanceof DocTextError ? err.message : err instanceof Error && err.name === "TimeoutError" ? "Download timed out" : "Couldn't read it";
        }
      }
    }),
  );
  return { documents, texts: orderDocs(texts.map((t) => ({ ...t, postedDate: documents.find((d) => d.name === t.name)?.postedDate }))).map(({ name, text }) => ({ name, text })) };
}

// Texts stay in memory for a while so a Claude reading right after doesn't download everything again.
const g = globalThis as unknown as { __kontractBidTexts?: Map<string, { at: number; texts: ReadDoc[] }>; __kontractBidReads?: Map<string, Promise<BidDetails>> };
const textCache = (g.__kontractBidTexts ??= new Map());
const inflight = (g.__kontractBidReads ??= new Map());

function remember(key: string, texts: ReadDoc[]) {
  textCache.set(key, { at: Date.now(), texts });
  for (const [k, v] of textCache) if (textCache.size > 12 || Date.now() - v.at > 30 * 60 * 1000) textCache.delete(k);
}

async function textsFor(o: Opportunity, list: BidDocument[], fp: string): Promise<{ documents: BidDocument[]; texts: ReadDoc[] }> {
  const page = o.source === "sled" ? (await portal(o)).page : null;
  const notice: ReadDoc[] = [...(o.description ? [{ name: "Notice", text: o.description }] : []), ...(page ? [page] : [])];
  const hit = textCache.get(`${o.id}:${fp}`);
  if (hit) return { documents: list, texts: hit.texts };
  const read = await readAll(list);
  const texts = [...notice, ...read.texts];
  remember(`${o.id}:${fp}`, texts);
  return { documents: read.documents, texts };
}

/** The facts in a notice's text and attachments (rules only: free). */
export async function readBid(o: Opportunity): Promise<BidDetails> {
  const list = await listAttachments(o);
  const fp = fingerprint(o, list);
  const key = `${o.id}:${fp}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = cached(`bid:${key}`, DETAILS_TTL, async () => {
    const { documents, texts } = await textsFor(o, list, fp);
    return extractBidDetails(o.id, texts, documents, fp);
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

const ReadingSchema = z.object({
  summary: z.string().describe("Two or three plain sentences: what the job is, where, how big"),
  scope: z
    .array(
      z.object({
        description: z.string().describe("One piece of work a subcontractor would price, e.g. 'Remove and replace built-up roofing'"),
        quantity: z.number().nullable().describe("Only if the documents state it"),
        unit: z.string().nullable().describe("Singular unit as written, e.g. 'square foot', 'each', 'lump sum'"),
        quote: z.string().describe("The exact words from the document this item comes from, 8 to 40 words, copied verbatim"),
        doc: z.string().describe("The document's name attribute"),
      }),
    )
    .describe("The work to be priced, from the scope, bid items or price form. Up to 25 items."),
  trades: z.array(z.string()).describe("Trades the job needs, e.g. 'Roofing', 'Asbestos abatement', 'Electrical'"),
  questions: z.array(z.string()).describe("Questions a subcontractor would need answered before quoting"),
  risks: z.array(z.string()).describe("Things in the documents that could sink a small prime: bonding, liquidated damages, phasing, tight access"),
});

const READING_SYSTEM = `You read U.S. government solicitation documents for a small business that wins the contract as the prime and hires a local subcontractor to do the work.
Only use what the documents say. Never invent quantities, sizes, dates or dollar amounts: if a quantity isn't stated, use null.
Every scope item must quote the exact words it came from, copied character for character from one document, and name that document.
Skip contract clauses and boilerplate; focus on the work itself.`;

/** Claude's reading of the scope (spends credits; cached per notice and attachment set). */
export async function readBidWithClaude(o: Opportunity): Promise<BidDetails> {
  if (!hasClaude()) throw new BidReadError("Add ANTHROPIC_API_KEY to have Claude read the scope.", 400);
  const details = await readBid(o);
  const reading = await cached(`bid-reading:${o.id}:${details.fingerprint}`, DETAILS_TTL, async () => {
    const list = await listAttachments(o);
    const { texts } = await textsFor(o, list, details.fingerprint);
    const corpus = buildCorpus(texts);
    if (!corpus.text) throw new BidReadError("There's no readable text in this notice's documents.", 422);
    const res = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...fallback(),
      output_config: { effort: "low", format: betaZodOutputFormat(ReadingSchema) },
      system: READING_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${corpus.text}\n\nThe notice: "${o.title}" (${o.solicitationNumber}), ${o.agency}, place of performance ${[o.placeOfPerformance.city, o.placeOfPerformance.state].filter(Boolean).join(", ")}.\nRead the documents above and return the summary, scope items, trades, questions for a subcontractor, and risks.`,
        },
      ],
    });
    if (res.stop_reason === "refusal") throw new ClaudeError("Claude declined to read these documents.", 422);
    if (!res.parsed_output) throw new ClaudeError("Claude's reading came back incomplete. Try again.", 502);
    return verifyReading(res.parsed_output, corpus.docs);
  });
  return { ...details, reading };
}

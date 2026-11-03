import type { BidReading, BidScopeItem } from "./types.ts";
import type { ReadDoc } from "./bid-details.ts";

// Pure helpers for reading a bid's documents: which to read first, what to
// send Claude (the parts that describe the job, not 400 pages of clauses),
// and checking that what comes back is really in the documents.

/** Amendments and the statement of work first, then the solicitation, price forms, and specs last. */
export function docRank(file: string): number {
  // "A04_Statement_of_Work.pdf" reads as "A04 Statement of Work.pdf".
  const name = file.replace(/_+/g, " ");
  if (/^notice$/i.test(name)) return 0;
  if (/amend|\bamd\b/i.test(name)) return 1;
  if (/statement of work|\bSOW\b|\bPWS\b|performance work|scope of work|description of work/i.test(name)) return 2;
  if (/\bRFQ\b|\bRFP\b|\bIFB\b|solicitation|\bsol\b|combined synopsis|\bS0\d\b|\bSF[- ]?(1442|1449)\b/i.test(name)) return 3;
  if (/price|pricing|bid schedule|breakdown|\bCLIN/i.test(name)) return 4;
  if (/question|answer|\bQ&A\b|\bRFI\b/i.test(name)) return 5;
  if (/wage|decision|\bWD\b|\bDBA\b|davis.?bacon|site visit log|sign-?in|map\b/i.test(name)) return 8;
  if (/spec|drawing|plans?\b/i.test(name)) return 7;
  return 6;
}

export function orderDocs<T extends { name: string; postedDate?: string | null }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => docRank(a.name) - docRank(b.name) || (b.postedDate ?? "").localeCompare(a.postedDate ?? ""));
}

const JOB_WORDS = /\b(?:scope|bid item|base bid|alternate|deductive|additive|remove|demoli|install|replace|repair|provide|furnish|square feet|\bSF\b|sq\.? ?ft|linear feet|each|quantity|phase|work includes|description of work)\b/i;

const PAGE_LINE = /^\[Page \d+\]$/;

/**
 * Long documents: the first part plus the paragraphs that talk about the work
 * itself. With `keepPages`, a PDF's [Page N] line is kept ahead of the first
 * paragraph kept from that page, so excerpts still say where they came from.
 */
function excerpt(text: string, budget: number, keepPages = false): string {
  if (text.length <= budget) return text;
  const head = text.slice(0, Math.floor(budget * 0.4));
  const rest: string[] = [];
  let used = head.length;
  let page = keepPages ? ([...head.matchAll(/\[Page \d+\]/g)].pop()?.[0] ?? null) : null;
  let shown = page;
  for (const para of text.slice(head.length).split(/\n{1,2}/)) {
    if (used >= budget) break;
    if (keepPages && PAGE_LINE.test(para)) {
      page = para;
      continue;
    }
    if (para.length < 30 || !JOB_WORDS.test(para) || /\(End of (?:Clause|Provision)\)|\b52\.\d{3}-\d+/i.test(para)) continue;
    if (page && page !== shown) {
      rest.push(page);
      used += page.length + 1;
      shown = page;
    }
    rest.push(para);
    used += para.length + 1;
  }
  return `${head}\n[…]\n${rest.join("\n")}`;
}

/**
 * What to send Claude: each document, ordered, within a character budget
 * (about 50,000 tokens by default). Wage determinations are left out; their
 * numbers are already pulled by the rules.
 */
export function buildCorpus(docs: ReadDoc[], maxChars = 200_000): { text: string; docs: ReadDoc[] } {
  const { text, docs: included } = assemble(docs, maxChars, false);
  return { text, docs: included };
}

/** Where one document sits in a combined text. */
export interface CorpusPart<T extends ReadDoc = ReadDoc> {
  doc: T;
  /** Where its <document> tag starts. */
  startsAt: number;
  /** Characters of its text included. */
  chars: number;
  excerpted: boolean;
}

/**
 * The bid's documents as one text for another model to read (the engine API's
 * /text): the same order and excerpting as buildCorpus, with [Page N] lines
 * kept, up to 400,000 characters, and where each document starts.
 */
export function bidText<T extends ReadDoc>(docs: T[], maxChars = 400_000): { text: string; parts: CorpusPart<T>[] } {
  const { text, parts } = assemble(docs, maxChars, true);
  return { text, parts };
}

function assemble<T extends ReadDoc>(docs: T[], maxChars: number, keepPages: boolean): { text: string; docs: ReadDoc[]; parts: CorpusPart<T>[] } {
  const kept = orderDocs(docs.filter((d) => d.text.trim() && docRank(d.name) !== 8));
  const blocks: string[] = [];
  const included: ReadDoc[] = [];
  const parts: CorpusPart<T>[] = [];
  let left = maxChars;
  let at = 0;
  for (const d of kept) {
    if (left < 2000) break;
    const share = docRank(d.name) >= 7 ? Math.min(left, 30_000) : Math.min(left, 80_000);
    const body = excerpt(d.text, share, keepPages);
    const block = `<document name="${d.name.replace(/"/g, "'")}">\n${body}\n</document>`;
    if (blocks.length) at += 2;
    parts.push({ doc: d, startsAt: at, chars: body.length, excerpted: body !== d.text });
    at += block.length;
    blocks.push(block);
    included.push({ name: d.name, text: body });
    left -= body.length + d.name.length + 30;
  }
  return { text: blocks.join("\n\n"), docs: included, parts };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%.]+/g, " ").trim();

/** True when the quote (give or take spacing and punctuation) appears in that document, or any. */
export function quoteFound(quote: string, docs: ReadDoc[], docName?: string): boolean {
  const q = squash(quote);
  if (q.length < 8) return false;
  const pool = docs.filter((d) => !docName || d.name === docName);
  return (pool.length ? pool : docs).some((d) => squash(d.text).includes(q));
}

/** A document's text in its PDF pages (page null before the first [Page N] line, or when there are none), squashed and joined. */
function squashedPages(text: string): { text: string; starts: { at: number; page: number | null }[] } {
  const pieces = text.split(/^\[Page (\d+)\][ \t]*$/m);
  const segs = [{ page: null as number | null, text: pieces[0] ?? "" }];
  for (let i = 1; i < pieces.length; i += 2) segs.push({ page: Number(pieces[i]), text: pieces[i + 1] ?? "" });
  let joined = "";
  const starts: { at: number; page: number | null }[] = [];
  for (const s of segs) {
    const sq = squash(s.text);
    if (!sq) continue;
    if (joined) joined += " ";
    starts.push({ at: joined.length, page: s.page });
    joined += sq;
  }
  return { text: joined, starts };
}

export interface QuoteLocation {
  found: boolean;
  /** The document it was found in. */
  doc: string | null;
  /** The PDF page it starts on, when the document has pages. */
  page: number | null;
}

/**
 * Where a quote really is: quoteFound's matching (spacing, case and
 * punctuation squashed, at least 8 characters), in the named document first,
 * then every other one. Page lines are ignored, so a quote that runs across a
 * page break still matches, and its page is where it starts.
 */
export function locateQuote(quote: string, docs: ReadDoc[], docName?: string | null): QuoteLocation {
  const none: QuoteLocation = { found: false, doc: null, page: null };
  const q = squash(quote.replace(/\[Page \d+\]/gi, " "));
  if (q.length < 8) return none;
  // The combined text writes " in a name as ', so either spelling names it.
  const named = (d: ReadDoc) => docName != null && (d.name === docName || d.name.replace(/"/g, "'") === docName);
  for (const d of [...docs.filter(named), ...docs.filter((d) => !named(d))]) {
    const { text, starts } = squashedPages(d.text);
    const at = text.indexOf(q);
    if (at < 0) continue;
    let page: number | null = null;
    for (const s of starts) if (s.at <= at) page = s.page;
    return { found: true, doc: d.name, page };
  }
  return none;
}

export interface RawReading {
  summary: string;
  scope: { description: string; quantity: number | null; unit: string | null; quote: string; doc: string }[];
  trades: string[];
  questions: string[];
  risks: string[];
}

/** Keep only scope items whose quoted words are really in the documents; tidy the rest. */
export function verifyReading(raw: RawReading, docs: ReadDoc[], now: Date = new Date()): BidReading {
  const scope: BidScopeItem[] = [];
  const seen = new Set<string>();
  for (const s of raw.scope) {
    const description = s.description.trim();
    if (!description || seen.has(description.toLowerCase())) continue;
    if (!quoteFound(s.quote, docs, s.doc)) continue;
    seen.add(description.toLowerCase());
    const doc = docs.find((d) => d.name === s.doc)?.name ?? docs.find((d) => squash(d.text).includes(squash(s.quote)))?.name ?? s.doc;
    scope.push({ description, quantity: s.quantity != null && Number.isFinite(s.quantity) && s.quantity > 0 ? s.quantity : null, unit: s.unit?.trim() || null, quote: s.quote.trim(), doc });
  }
  const list = (xs: string[], n: number) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, n);
  return { summary: raw.summary.trim(), scope: scope.slice(0, 40), trades: list(raw.trades, 12), questions: list(raw.questions, 10), risks: list(raw.risks, 10), readAt: now.toISOString() };
}

// ---- State and local bid pages ----

const DOC_LINK = /\.(pdf|docx|xlsx|xlsm|pptx|txt)(?:[?#]|$)/i;
const SITE_WIDE = /user-?guide|help|faq|privacy|accessib|terms|cityrecord-\d{2}-\d{2}-\d{2}\.pdf|logo|banner/i;

/** Links on a bid page that look like the bid's own documents (not the portal's guides). */
export function documentLinks(links: string[], pageUrl: string): { url: string; name: string }[] {
  const out = new Map<string, string>();
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l, pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || !DOC_LINK.test(u.pathname) || SITE_WIDE.test(u.pathname)) continue;
    const name = decodeURIComponent(u.pathname.split("/").pop() ?? "").replace(/[_+]/g, " ").trim();
    if (name && !out.has(u.href)) out.set(u.href, name);
  }
  return [...out].slice(0, 25).map(([url, name]) => ({ url, name }));
}

/** A portal page as readable text: no images, link text without URLs, no language pickers. */
export function cleanPageMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .filter((l) => !/^\s*Select Language/i.test(l) && l.length < 2000)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

import type { BidBudget, BidDetails, BidDocument, Cited } from "./types.ts";

// Rules that read a notice's text and attachments for the facts that decide
// a bid: the budget range, bonds, the site visit, when questions are due,
// how long the work runs, wage rates, how quotes are judged, sizes and
// special requirements. Each fact keeps the words it came from and the
// document, so you can check it. Free and instant; Claude's reading (scope
// items, trades) is a separate, on-request step.

export interface ReadDoc {
  name: string;
  text: string;
}

const MONEY = String.raw`\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|mil|M|thousand|K)\b)?`;

/** "$1,000,000.00" → 1000000; "$1.5 million" → 1500000; "$500K" → 500000. */
export function parseMoney(s: string): number | null {
  const m = s.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(million|mil|m|thousand|k)?\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toLowerCase();
  return Math.round(unit === "million" || unit === "mil" || unit === "m" ? n * 1e6 : unit === "thousand" || unit === "k" ? n * 1e3 : n);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The sentence (or line) around a match, trimmed to about 240 characters. */
function around(text: string, index: number, length: number): string {
  const before = text.lastIndexOf(".", index);
  const lineStart = text.lastIndexOf("\n", index);
  const start = Math.max(before + 1, lineStart + 1, index - 160);
  const afterDot = text.indexOf(". ", index + length);
  const end = Math.min(afterDot === -1 ? text.length : afterDot + 1, index + length + 200);
  return clean(text.slice(start, end));
}

function cite<T>(value: T, text: string, index: number, length: number, doc: string): Cited<T> {
  return { value, quote: around(text, index, length), doc };
}

// ---- Budget ----

const RANGE = new RegExp(String.raw`(?:between\s+(${MONEY})\s+and\s+(${MONEY})|(?:less than|under|below)\s+(${MONEY})|(?:more than|over|greater than|in excess of|exceeds?)\s+(${MONEY}))`, "gi");

function range(m: RegExpExecArray): BidBudget {
  if (m[1]) return { low: parseMoney(m[1]), high: parseMoney(m[2]!), kind: "magnitude" };
  if (m[3]) return { low: null, high: parseMoney(m[3]), kind: "magnitude" };
  return { low: parseMoney(m[4]!), high: null, kind: "magnitude" };
}

/**
 * Construction bids must disclose the project's magnitude as a price range
 * (FAR 36.204). Forms often list every range with one box checked, so a list
 * counts only when exactly one option is marked.
 */
function magnitude(doc: ReadDoc): Cited<BidBudget> | null {
  const t = doc.text;
  for (const hit of t.matchAll(/magnitude/gi)) {
    const from = hit.index!;
    const window = t.slice(from, from + 700);
    const ranges = [...window.matchAll(RANGE)];
    if (ranges.length === 0 || ranges[0]!.index! > 260) continue;
    if (ranges.length >= 3 && ranges[2]!.index! < 600) {
      const marked = ranges.filter((r) => /(?:☒|\[\s*x\s*\]|\(\s*x\s*\)|■|✔|✓|\bX)\s*$/i.test(window.slice(Math.max(0, r.index! - 8), r.index!)));
      if (marked.length !== 1) continue;
      const r = marked[0]!;
      return cite(range(r), t, from + r.index!, r[0].length, doc.name);
    }
    const r = ranges[0]!;
    return { value: range(r), quote: clean(t.slice(from, from + r.index! + r[0].length + 1)).slice(0, 300), doc: doc.name };
  }
  return null;
}

const ESTIMATE = new RegExp(
  String.raw`(?:estimated|anticipated|approximate|projected)\s+(?:total\s+)?(?:contract\s+|project\s+|construction\s+)?(?:value|cost|price|amount|budget)[^.$\n]{0,60}?(${MONEY})(?:\s*(?:to|-|–|and)\s*(${MONEY}))?|budget\s+(?:of|is|for this (?:project|contract|requirement)(?: is)?)\s*(?:approximately\s+)?(${MONEY})`,
  "i",
);
const CEILING = new RegExp(String.raw`(?:not[- ](?:to[- ])?exceed|NTE|ceiling|maximum (?:contract )?value)[^.$\n]{0,40}?(${MONEY})`, "gi");

function estimate(doc: ReadDoc): Cited<BidBudget> | null {
  const m = ESTIMATE.exec(doc.text);
  if (!m) return null;
  const low = parseMoney(m[1] ?? m[3]!);
  const high = m[2] ? parseMoney(m[2]) : low;
  if (!low || low < 2500) return null;
  return cite({ low, high, kind: "estimate" }, doc.text, m.index, m[0].length, doc.name);
}

function ceiling(doc: ReadDoc): Cited<BidBudget> | null {
  for (const m of doc.text.matchAll(CEILING)) {
    const n = parseMoney(m[1]!);
    const sentence = around(doc.text, m.index!, m[0].length);
    // Clauses quote thresholds ("orders not to exceed $3,500") and fee caps ("1% of the contract amount, not to exceed $10,000");
    // keep only a ceiling on this contract's total.
    const before = doc.text.slice(Math.max(0, m.index! - 80), m.index!);
    if (!n || n < 10_000 || !/\b(?:contract|award|order|project|total|budget)\b[^.]{0,40}$/i.test(before) || /micro-?purchase|threshold|clause|percent|%|\bfees?\b|per (?:day|occurrence|claim|hour)|deductible|liquidated/i.test(sentence)) continue;
    return { value: { low: null, high: n, kind: "ceiling" }, quote: sentence, doc: doc.name };
  }
  return null;
}

export function findBudget(docs: ReadDoc[]): Cited<BidBudget> | null {
  for (const find of [magnitude, estimate, ceiling]) {
    for (const d of docs) {
      const hit = find(d);
      if (hit) return hit;
    }
  }
  return null;
}

// ---- Dates ----

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE = new RegExp(String.raw`\b(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(?:(${MONTHS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)|(\d{1,2})/(\d{1,2})/(20\d\d|\d\d))\b`, "i");

/** The first date in a string, as YYYY-MM-DD. */
export function firstDate(s: string): string | null {
  const m = DATE.exec(s);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[1]) {
    mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1]!.toLowerCase().slice(0, 3)) + 1;
    d = Number(m[2]);
    y = Number(m[3]);
  } else {
    mo = Number(m[4]);
    d = Number(m[5]);
    y = Number(m[6]!.length === 2 ? `20${m[6]}` : m[6]);
  }
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function siteVisit(docs: ReadDoc[]): BidDetails["siteVisit"] {
  const re = /\b(?:site visits?|pre-?(?:bid|proposal|quote)\s+(?:conference|meeting|site visit|walk[- ]?through)|site walk(?:[- ]?through)?|job walk)\b/gi;
  let fallback: BidDetails["siteVisit"] = null;
  for (const d of docs) {
    for (const m of d.text.matchAll(re)) {
      const quote = around(d.text, m.index!, m[0].length);
      const date = firstDate(quote);
      const mandatory = /\bmandatory\b|\brequired to attend\b|must attend/i.test(quote) && !/not (?:be )?mandatory|non-?mandatory|optional|not required/i.test(quote);
      const hit = { value: { date, mandatory }, quote, doc: d.name };
      if (date) return hit;
      fallback ??= /scheduled|will be held|will take place|is planned/i.test(quote) ? hit : null;
    }
  }
  return fallback;
}

function questionsDue(docs: ReadDoc[]): BidDetails["questionsDue"] {
  const re = /\b(?:questions|RFIs?|requests? for information|inquiries|technical questions)\b/gi;
  for (const d of docs) {
    for (const m of d.text.matchAll(re)) {
      const quote = around(d.text, m.index!, m[0].length);
      if (!/no later than|due|deadline|must be (?:submitted|received)|by \d|before|cut-?off/i.test(quote)) continue;
      const date = firstDate(quote);
      if (date) return { value: date, quote, doc: d.name };
    }
  }
  return null;
}

// ---- Everything else ----

function bonds(docs: ReadDoc[]): BidDetails["bonds"] {
  const all = docs.map((d) => d.text).join("\n");
  const notRequired = /\bbonds? (?:are|is) not required\b|\bno (?:bid |performance |payment )?bonds? (?:are |is )?required\b/i.exec(all);
  const kinds: string[] = [];
  let first: { i: number; len: number; doc: string; text: string } | null = null;
  for (const d of docs) {
    for (const [re, label] of [
      [/\bbid (?:bond|guarantee)\b/i, "Bid bond"],
      [/\bperformance bonds?\b|\b(?:performance and payment|payment and performance) bonds?\b/i, "Performance bond"],
      [/\bpayment bonds?\b|\b(?:performance and payment|payment and performance) bonds?\b/i, "Payment bond"],
    ] as const) {
      const m = re.exec(d.text);
      if (!m || kinds.includes(label)) continue;
      kinds.push(label);
      first ??= { i: m.index, len: m[0].length, doc: d.name, text: d.text };
    }
  }
  if (notRequired && kinds.length === 0) return { value: [], quote: around(all, notRequired.index, notRequired[0].length), doc: docs.find((d) => d.text.includes(notRequired[0]))?.name ?? "" };
  if (!first) return null;
  const pct = all.match(/bid guarantee[^.]{0,200}?(\d{1,3})\s*(?:%|percent)/i)?.[1];
  const value = kinds.map((k) => (k === "Bid bond" && pct ? `Bid bond (${pct}% of your price)` : k));
  return cite(value, first.text, first.i, first.len, first.doc);
}

function period(docs: ReadDoc[]): Cited<string> | null {
  const res = [
    /period of performance[^.\n]{0,60}?\b(\d{1,4}\s*(?:calendar|working|business)?\s*days?(?:[^.\n]{0,40}?(?:notice to proceed|NTP|award))?)/i,
    /\bcomplete[ds]?\b[^.\n]{0,80}?\bwithin\s+(\d{1,4}\s*(?:calendar|working|business)?\s*days?(?:[^.\n]{0,40}?(?:notice to proceed|NTP|award))?)/i,
    /\b(base (?:year|period)[^.\n]{0,40}?(?:plus|and|with)\s+(?:\w+\s+){0,2}\(?\d?\)?\s*(?:one-year\s+)?option (?:years|periods))/i,
  ];
  for (const re of res) {
    for (const d of docs) {
      const m = re.exec(d.text);
      if (m) return { value: clean(m[1]!).replace(/\bNTP\b/, "notice to proceed"), quote: around(d.text, m.index, m[0].length), doc: d.name };
    }
  }
  return null;
}

function wageDeterminations(docs: ReadDoc[], names: string[]): string[] {
  const found = new Set<string>();
  const hay = [...docs.map((d) => d.text), ...names].join("\n");
  for (const m of hay.matchAll(/\b(?:Wage Determination|General Decision|Decision|WD)\s*(?:No\.?|Number|#)?\s*:?\s*([A-Z]{2}\s?20\d{6}|\d{4}-\d{4})\b/gi)) found.add(m[1]!.replace(/\s/g, ""));
  for (const m of hay.matchAll(/\b([A-Z]{2}20\d{6})\b/g)) if (/decision|wage|dba|davis/i.test(hay.slice(Math.max(0, m.index! - 80), m.index!))) found.add(m[1]!);
  return [...found].slice(0, 6);
}

function evaluation(docs: ReadDoc[]): Cited<string> | null {
  const rules: [RegExp, string][] = [
    [/lowest price technically acceptable|\bLPTA\b/i, "Lowest price technically acceptable: the cheapest quote that meets the requirements wins"],
    [/comparative (?:analysis|evaluation)/i, "Comparative analysis: quotes are compared side by side, so price isn't the only thing that counts"],
    [/best value|trade-?off/i, "Best value: price and quality both count"],
    [/\blowest (?:evaluated )?price\b|\blow bid\b|\blowest responsive\b/i, "Lowest price wins"],
  ];
  for (const [re, label] of rules) {
    for (const d of docs) {
      const m = re.exec(d.text);
      if (m) return cite(label, d.text, m.index, m[0].length, d.name);
    }
  }
  return null;
}

function sizes(docs: ReadDoc[]): Cited<string>[] {
  const out: Cited<string>[] = [];
  const seen = new Set<string>();
  const re = /\b(\d{1,3}(?:,\d{3})+|\d{3,7})(?:\.\d+)?\s*(square feet|sq\.?\s?ft\.?|SF|square yards|SY|linear feet|LF|acres)\b/gi;
  for (const d of docs) {
    for (const m of d.text.matchAll(re)) {
      const n = Number(m[1]!.replace(/,/g, ""));
      // "lbs/100 sq. ft." is a rate, not a size.
      if (n < 100 || d.text[m.index! - 1] === "/") continue;
      const unit = /^s(q|f)|square feet/i.test(m[2]!) && !/yard/i.test(m[2]!) ? "sq ft" : /yard|^SY$/i.test(m[2]!) ? "sq yd" : /linear|^LF$/i.test(m[2]!) ? "linear ft" : "acres";
      const key = `${n} ${unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = cite(`${n.toLocaleString("en-US")} ${unit}`, d.text, m.index!, m[0].length, d.name);
      if (boilerplate(hit.quote)) continue;
      out.push(hit);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/** Contract fine print (clauses, definitions) and long checklists mention everything; they aren't this job's requirements. */
function boilerplate(quote: string): boolean {
  return (
    /\(End of (?:Clause|Provision)\)|\bclause\b|\b(?:52|852)\.\d{3}-\d+|\bmeans\b|\bdefinitions?\b|\bare granted to\b|U\.S\.C\.|\bCFR\b/i.test(quote) ||
    (quote.match(/\b\d{1,2}\)\s/g)?.length ?? 0) >= 3 ||
    /\.{6,}/.test(quote)
  );
}

const REQUIREMENTS: [RegExp, string][] = [
  [/asbestos|\bACM\b/i, "Asbestos abatement or handling"],
  [/lead[- ]based paint (?:abatement|removal|hazard|survey)|\blead abatement\b(?![^.]{0,40}prohibited)/i, "Lead paint work"],
  [/(?:remov\w*|abate\w*|handl\w*|dispos\w*|survey\w*) (?:of )?(?:the )?hazardous materials?|hazardous materials? (?:abatement|removal|handling|survey)/i, "Hazardous materials"],
  [/infection control|\bICRA\b/i, "Infection control (work in an occupied medical building)"],
  [/security clearance|secret clearance/i, "Security clearance"],
  [/background (?:check|investigation)|\bPIV\b|E-Verify/i, "Background checks or badges for workers"],
  [/\bOSHA[- ]?30\b/i, "OSHA 30 for the superintendent"],
  [/\bOSHA[- ]?10\b/i, "OSHA 10 for workers"],
  [/EM ?385|accident prevention plan|activity hazard analys/i, "Safety plan (accident prevention plan / activity hazard analyses)"],
  [/\bC-?39\b|roofing contractor'?s? license/i, "Roofing contractor license"],
  [/state contractor'?s? license|licensed (?:in|by) the state|CSLB/i, "State contractor license"],
  [/(\d{1,2})[- ]year (?:manufacturer'?s? )?(?:warranty|guarantee)/i, "Warranty"],
  [/occupied (?:building|facility)/i, "Work in an occupied building"],
  [/(?:normal|regular|permitted|allowable|standard) (?:working|work) hours|work(?:ing)? hours (?:are|will be|shall be) (?:limited|restricted|from)|between the hours of/i, "Set working hours"],
  [/davis[- ]bacon|prevailing wage|service contract (?:act|labor standards)/i, "Prevailing wages"],
];

function requirements(docs: ReadDoc[]): Cited<string>[] {
  const out: Cited<string>[] = [];
  for (const [re, label] of REQUIREMENTS) {
    const global = new RegExp(re.source, "gi");
    found: for (const d of docs) {
      for (const m of d.text.matchAll(global)) {
        const hit = cite(label, d.text, m.index!, m[0].length, d.name);
        if (boilerplate(hit.quote)) continue;
        const years = label === "Warranty" ? m[1] : null;
        out.push(years ? { ...hit, value: `${years}-year warranty` } : hit);
        break found;
      }
    }
  }
  return out;
}

const FORM_NAME = /\bform\b|price|pricing|breakdown|schedule|bid sheet|cost proposal|questionnaire|experience|past performance|reference|\bSF[- ]?(?:1442|1449|18|30|33|24|25)\b|certification|representation|attachment [a-z0-9]\b/i;

function forms(documents: BidDocument[], docs: ReadDoc[]): string[] {
  const out = documents.filter((d) => FORM_NAME.test(d.name) && !/wage|decision|specification|drawing|site visit log|sign-?in/i.test(d.name)).map((d) => d.name);
  const all = docs.map((d) => d.text).join("\n");
  if (/\bSF[- ]?1442\b|standard form 1442/i.test(all)) out.push("SF 1442 (construction offer form)");
  else if (/\bSF[- ]?1449\b|standard form 1449/i.test(all)) out.push("SF 1449 (offer form)");
  if (/\bSF[- ]?24\b/i.test(all) && /bid bond/i.test(all)) out.push("SF 24 (bid bond)");
  return [...new Set(out)].slice(0, 12);
}

function priceForm(docs: ReadDoc[], documents: BidDocument[]): BidDetails["priceForm"] {
  const sheet = docs.find((d) => /\.(xlsx|xlsm)$/i.test(d.name) && /price|pricing|cost|bid|schedule|breakdown|clin/i.test(d.name)) ?? docs.find((d) => /\.(xlsx|xlsm)$/i.test(d.name) && documents.some((x) => x.name === d.name));
  if (!sheet) return null;
  const cells = sheet.text.split("\n").flatMap((l) => l.split(" | ").map((c) => c.trim()));
  // Line items when the form numbers them (CLINs, bid items, divisions), else the first column's labels.
  const items = [...new Set(cells.filter((c) => /^(?:CLIN|(?:bid )?item|line|division|div\.?)\s*#?\s*\d/i.test(c) && c.length < 90))];
  if (items.length >= 2) return { doc: sheet.name, rows: items.slice(0, 40) };
  const rows = [
    ...new Set(
      sheet.text
        .split("\n")
        .map((l) => l.split(" | ")[0]!.trim())
        .filter((c) => c.length > 2 && c.length < 90 && !/^##|^\d[\d,.]*$|^total|subtotal|grand total/i.test(c) && /[a-z]/i.test(c)),
    ),
  ].slice(0, 40);
  return rows.length ? { doc: sheet.name, rows } : null;
}

/** Facts from the documents we could read (the notice text counts as one, named "Notice"). */
export function extractBidDetails(noticeId: string, docs: ReadDoc[], documents: BidDocument[], fingerprint: string, now: Date = new Date()): BidDetails {
  // Callers pass the notice text first, then the newest documents, so amendments win.
  const ordered = docs;
  return {
    noticeId,
    readAt: now.toISOString(),
    fingerprint,
    documents,
    budget: findBudget(ordered),
    bonds: bonds(ordered),
    siteVisit: siteVisit(ordered),
    questionsDue: questionsDue(ordered),
    period: period(ordered),
    wageDeterminations: wageDeterminations(ordered, documents.map((d) => d.name)),
    evaluation: evaluation(ordered),
    sizes: sizes(ordered),
    requirements: requirements(ordered),
    forms: forms(documents, ordered),
    priceForm: priceForm(ordered, documents),
  };
}

/** Whole days from today (local calendar) to a YYYY-MM-DD date: negative once it's passed. */
export function daysTo(ymd: string, now: Date = new Date()): number {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "$1M–$2M", "Under $25K", "Over $10M", "About $250K". */
export function budgetLabel(b: BidBudget): string {
  const short = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K` : `$${n}`);
  if (b.low != null && b.high != null) return b.low === b.high ? `About ${short(b.low)}` : `${short(b.low)}–${short(b.high)}`;
  if (b.high != null) return b.kind === "ceiling" ? `Up to ${short(b.high)}` : `Under ${short(b.high)}`;
  if (b.low != null) return `Over ${short(b.low)}`;
  return "Not stated";
}

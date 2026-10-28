import type { Contact, Opportunity, Place } from "./types.ts";

// Pure helpers that turn rows of SAM.gov's daily Contract Opportunities
// extract (ContractOpportunitiesFullCSV.csv) into our Opportunity shape.

const SMALL = new Set(["of", "and", "the", "for", "in", "on", "at", "to", "a", "an", "or", "by"]);

/** "VETERANS AFFAIRS, DEPARTMENT OF" → "Department of Veterans Affairs". */
export function prettyName(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  const flipped = s.match(/^(.*),\s*(DEPARTMENT OF( THE)?|OFFICE OF( THE)?)$/i);
  if (flipped) s = `${flipped[2]} ${flipped[1]}`;
  const letters = s.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 0 && upper / letters.length < 0.8) return s; // already mixed case
  return s
    .toLowerCase()
    .split(/(\s+|-|\/|\()/)
    .map((w, i) => {
      if (!/[a-z]/.test(w)) return w;
      if (/\d/.test(w) || /^(usa|us|va|dod|dla|gsa|nasa|faa|epa|hvac|nsn|ii|iii|iv|fy\d*)$/.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

/** Turn an HTML description into readable plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h\d|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Columns the extract must have; anything else is optional. */
export const REQUIRED_COLUMNS = ["NoticeId", "Title", "Type", "PostedDate", "ResponseDeadLine", "Active"] as const;

export type BulkRow = Record<string, string>;

// SAM.gov times without an offset are Eastern; -05:00 is close enough for day counts.
const EASTERN = "-05:00";

/**
 * Parse the extract's date formats: "2026-11-13T16:00:00-08:00",
 * "2026-11-13T16:00:00", "2026-10-27 11:27:28" and "2026-11-13".
 * Date-only values are treated as end of day for deadlines, midday otherwise.
 */
export function parseSamDate(raw: string, kind: "deadline" | "posted"): string | null {
  const s = raw.trim();
  if (!s) return null;
  let iso = s;
  if (/^\d{4}-\d\d-\d\d$/.test(s)) iso = `${s}T${kind === "deadline" ? "23:59:00" : "12:00:00"}${EASTERN}`;
  else if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s)) iso = `${s.replace(" ", "T")}${EASTERN}`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** '["SBA"]', 'SBA', 'NONE', '' → 'SBA' | null */
export function parseSetAsideCode(raw: string): string | null {
  const code = raw.replace(/[[\]"'\s]/g, "").split(",")[0] ?? "";
  return code && code.toUpperCase() !== "NONE" ? code : null;
}

function contact(row: BulkRow, prefix: "Primary" | "Secondary"): Contact | null {
  const name = row[`${prefix}ContactFullname`]?.trim();
  const email = row[`${prefix}ContactEmail`]?.trim();
  if (!name && !email) return null;
  return {
    name: name || email!,
    title: row[`${prefix}ContactTitle`]?.trim() || undefined,
    email: email || undefined,
    phone: row[`${prefix}ContactPhone`]?.trim() || undefined,
  };
}

const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function normalizeBulkRow(row: BulkRow): Opportunity | null {
  const id = row.NoticeId?.trim();
  if (!id) return null;
  const agency = prettyName(row["Department/Ind.Agency"] ?? "");
  const office = prettyName(row.Office || row["Sub-Tier"] || "");
  const popState = opt(row.PopState);
  const place: Place = popState
    ? { city: opt(row.PopCity) && prettyName(row.PopCity!), state: popState, zip: opt(row.PopZip), country: opt(row.PopCountry) }
    : { city: opt(row.City) && prettyName(row.City!), state: opt(row.State), zip: opt(row.ZipCode), country: opt(row.CountryCode) };
  const rawDescription = (row.Description ?? "").replace(/\r\n?/g, "\n").trim();
  const setAside = opt(row.SetASide);
  const setAsideCode = parseSetAsideCode(row.SetASideCode ?? "");
  return {
    id,
    // Some agencies prefix titles with the product/service code, e.g. "Z1DZ--Replace Roof".
    title: prettyName(row.Title?.trim().replace(/^[A-Z0-9]{4}\s*--\s*/, "") || "Untitled notice"),
    solicitationNumber: row["Sol#"]?.trim() ?? "",
    agency,
    office: office === agency ? "" : office,
    postedDate: parseSamDate(row.PostedDate ?? "", "posted") ?? new Date(0).toISOString(),
    responseDeadline: parseSamDate(row.ResponseDeadLine ?? "", "deadline"),
    type: row.Type?.trim() || row.BaseType?.trim() || "",
    setAside: setAsideCode && setAside && !/^no set aside/i.test(setAside) ? setAside : null,
    setAsideCode,
    naicsCode: opt(row.NaicsCode) ?? null,
    pscCode: opt(row.ClassificationCode) ?? null,
    placeOfPerformance: place,
    placeFromOffice: popState ? undefined : true,
    contacts: [contact(row, "Primary"), contact(row, "Secondary")].filter((c): c is Contact => c !== null),
    attachments: null,
    description: /<\w+[^>]*>/.test(rawDescription) ? htmlToText(rawDescription) : rawDescription,
    samUrl: `https://sam.gov/opp/${id}/view`,
    source: "bulk",
  };
}

const KEEP_TYPES = new Set(["Solicitation", "Combined Synopsis/Solicitation", "Presolicitation", "Sources Sought"]);
const NO_DEADLINE_MAX_AGE_DAYS = 90;

/**
 * Keep notices someone could still act on: solicitations, presolicitations
 * and sources sought that are still open, or have no deadline and were
 * posted in the last 90 days. Drops award notices, closed notices and the like.
 */
export function keepForSearch(o: Opportunity, now: Date = new Date()): boolean {
  if (!KEEP_TYPES.has(o.type)) return false;
  if (o.responseDeadline) return Date.parse(o.responseDeadline) >= now.getTime();
  return now.getTime() - Date.parse(o.postedDate) <= NO_DEADLINE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

const SHORT_DESCRIPTION_RATIO = 0.6;
const CANCELLED = /\bcancel(?:l?ed|lation|ling)?\b/i;

/** Versions of one solicitation share this key (solicitation number + agency). */
export function versionKey(o: Opportunity): string {
  const sol = o.solicitationNumber.trim().toUpperCase();
  return sol.length >= 4 ? `${sol}|${o.agency}` : `id:${o.id}`;
}

/** An award or cancellation closes out every earlier version of the solicitation. */
export function closesOut(o: Opportunity): boolean {
  return /^award/i.test(o.type) || CANCELLED.test(o.title);
}

/**
 * SAM.gov posts each amendment as its own notice. Merge versions that share a
 * solicitation number and agency: keep the newest (current deadline, type and
 * contacts) and count the versions. If the newest description is much shorter
 * than an earlier one (e.g. "Amendment 2 extends the deadline"), append the
 * fullest earlier text so the whole scope is still there. Drops solicitations
 * that were awarded or cancelled after their newest open version
 * (`closedAt`: version key → latest award/cancellation posted date).
 */
export function mergeVersions(
  entries: [Opportunity, string | undefined][],
  closedAt: Map<string, string> = new Map(),
): [Opportunity, string | undefined][] {
  const groups = new Map<string, [Opportunity, string | undefined][]>();
  for (const e of entries) {
    const key = versionKey(e[0]);
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  const out: [Opportunity, string | undefined][] = [];
  for (const [key, g] of groups) {
    g.sort((a, b) => b[0].postedDate.localeCompare(a[0].postedDate));
    const [latest, latestDesc] = g[0]!;
    const closed = closedAt.get(key);
    if (closesOut(latest) || (closed && closed >= latest.postedDate)) continue;
    if (g.length === 1) {
      out.push(g[0]!);
      continue;
    }
    const fullest = g.reduce((best, e) => ((e[1]?.length ?? 0) > (best[1]?.length ?? 0) ? e : best), g[0]!);
    let description = latestDesc;
    if (fullest !== g[0] && fullest[1] && (latestDesc?.length ?? 0) < fullest[1].length * SHORT_DESCRIPTION_RATIO) {
      description = latestDesc ? `${latestDesc}\n\nEarlier version of this notice:\n${fullest[1]}` : fullest[1];
    }
    out.push([{ ...latest, versions: g.length }, description]);
  }
  return out;
}
